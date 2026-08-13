import {
  resolveResumeRunId,
  type StreamChunk,
  type StreamDurability,
} from '@tanstack/ai'
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import {
  appendNotificationChannel,
  ensureAppendListener,
  watchRun,
} from '@/server/ai/append-notifications'
import { db } from '@/server/db/client'
import { deliveryLogEvents } from '@/server/db/schema/delivery-log-events'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'

/**
 * The run log every durable run is written to and replayed from, backed by
 * Postgres.
 *
 * This module *is* the log rather than a seam in front of one: the offset
 * format, the run it resolves, and the storage behind it are one subject, and
 * splitting them only meant a caller had to walk two files to read one idea.
 * Swapping the log for another backend is still a change to this file and no
 * other — that was the property worth keeping, and being the implementation
 * gets it more directly than pointing at one did. It has been used once: the
 * in-memory backend this started on was replaced here, and the endpoint that
 * imports `streamStore` did not move.
 *
 * The reference in-memory backend in `@tanstack/ai`'s `stream-durability.ts` is
 * the specification for the five methods; read it alongside this. The two
 * places this deliberately diverges — the bounded wait between events, and the
 * database-wide cursor — are commented where they happen.
 *
 * This is tier 2: a run's log outlives the process that produced it, so a
 * finished run replays after a restart. It is not tier 3. If the process dies
 * mid-run the producer dies with it, and the log holds a partial run that is
 * never terminalised — the wait bound below is what turns that into an error
 * rather than a client parked forever.
 */

/**
 * The wire offset carries both the run and the position.
 *
 * Both halves are load-bearing. The position must name its own run because the
 * endpoint contract permits a rejoin that supplies a position and no run id.
 * The version prefix must survive because the position is a row id from a
 * single database-wide sequence: partition or shard the event table and the
 * scheme has to change, and the prefix is what lets an old offset be rejected
 * rather than misread.
 *
 * Offsets become server-sent-event `id:` lines, so they must be non-empty,
 * carry no CR or LF, and equal their own trimmed form. Percent-encoding the run
 * id guarantees all three.
 */
const OFFSET_PREFIX = 'pg:v1:'

/** Replay everything, and attach at the tail: positions that name no run. */
const FROM_START_OFFSET = '-1'
const FROM_TAIL_OFFSET = 'now'

/**
 * How long a from-start join waits for a run's first event before failing.
 *
 * Longer than the in-memory backend's 100ms because every check here is a
 * database round trip and the notification arrives over a second connection,
 * but still short: the common from-start join is a reload rejoining a run whose
 * producer started in an earlier request, so its log already holds events and
 * this deadline never applies. An empty log means the run is gone, and failing
 * quickly re-enables the composer instead of hanging.
 */
const FIRST_EVENT_DEADLINE_MS = 1_000

/**
 * How long a caught-up reader waits between events before failing.
 *
 * This bound is a deliberate divergence from the reference in-memory backend,
 * which bounds only the wait for the first event on the reasoning that once a
 * run has produced anything its producer owns termination. That reasoning does
 * not survive the move to a database: this log outlives its producer, so a
 * process killed mid-run leaves a log that is never terminalised and a
 * rejoining client would park on it forever with no error. Sweeping
 * unterminated logs at startup was rejected instead — under hot reload that
 * fires on every save and would terminalise a run that is still streaming.
 *
 * Tune it against the slowest gap a healthy run can produce: a slow model's
 * first token, or a long tool call. Too low and a live run is declared dead;
 * too high and a dead run keeps a client waiting.
 */
export const PRODUCER_SILENCE_TIMEOUT_MS = 45_000

/**
 * Where a resume says it wants to start from: `Last-Event-ID` first, then
 * `?offset`.
 *
 * The library applies this precedence in its own transports but does not export
 * it, so it has to be restated here — including the truthiness test, so that an
 * empty `Last-Event-ID` falls through to `?offset` exactly as it does there. A
 * reading that disagreed with the transport's would refuse resumes the
 * transport would have served.
 */
function resolveResumeOffset(request: Request) {
  const header = request.headers.get('Last-Event-ID')

  if (header) return header

  try {
    return new URL(request.url).searchParams.get('offset')
  } catch {
    return null
  }
}

function encodeOffset(runId: string, position: number) {
  return `${OFFSET_PREFIX}${encodeURIComponent(runId)}:${position}`
}

function decodeOffset(offset: string) {
  if (!offset.startsWith(OFFSET_PREFIX)) {
    throw new Error(`Invalid run log offset: ${JSON.stringify(offset)}`)
  }

  const encoded = offset.slice(OFFSET_PREFIX.length)
  const separator = encoded.lastIndexOf(':')

  if (separator === -1) {
    throw new Error(`Invalid run log offset: ${JSON.stringify(offset)}`)
  }

  const runId = decodeURIComponent(encoded.slice(0, separator))
  const position = Number(encoded.slice(separator + 1))

  if (!Number.isSafeInteger(position) || position < 1) {
    throw new Error(`Invalid run log offset: ${JSON.stringify(offset)}`)
  }

  return { runId, position }
}

/**
 * Drop the accumulated mirror of a chunk's own history before storing it.
 *
 * `TEXT_MESSAGE_CONTENT` carries the new tokens in `delta` *and* every delta
 * before them in `content`, so storing it whole costs O(reply length²): a
 * measured 3.2k-character reply cost 421kB across 268 rows, of which 3.2kB was
 * new information, and a 30k-character reply would cost around 34MB.
 *
 * Dropping it is safe because the library treats `delta` as authoritative — its
 * stream processor accumulates from `delta` and consults `content` only when no
 * delta is present, and the field's own type annotates it as internal. The
 * guard is what preserves that fallback: the mirror goes only when a delta is
 * actually there to rebuild it from, so a provider that emits content-only
 * chunks still round-trips byte for byte.
 *
 * This is the sole exception to storing chunks verbatim, and it is the reason
 * the event table's own comment now names one.
 */
function withoutAccumulatedContent(chunk: StreamChunk): StreamChunk {
  const isRebuildableFromDeltas =
    'content' in chunk && typeof chunk.delta === 'string' && chunk.delta !== ''

  if (!isRebuildableFromDeltas) return chunk

  const { content: _accumulated, ...withoutMirror } = chunk

  return withoutMirror as StreamChunk
}

function assertValidRunId(runId: string) {
  if (runId.length === 0 || /[\r\n]/.test(runId)) {
    throw new Error(
      `Invalid runId (must be non-empty and contain no CR/LF): ${JSON.stringify(runId)}`,
    )
  }

  return runId
}

function namesItsOwnRun(offset: string | null): offset is string {
  return (
    offset !== null &&
    offset !== FROM_START_OFFSET &&
    offset !== FROM_TAIL_OFFSET
  )
}

function resolveRunId(request: Request, resumeOffset: string | null) {
  const requestedRunId = resolveResumeRunId(request)

  if (namesItsOwnRun(resumeOffset)) {
    const offsetRunId = decodeOffset(resumeOffset).runId

    // The offset is authoritative — it is the only one of the two this log
    // minted. A request that also names a run and names a different one is
    // asking for two runs at once; served from the offset alone it would look
    // like it had worked, so say what is wrong instead.
    if (requestedRunId !== null && requestedRunId !== offsetRunId) {
      throw new Error(
        `Resume offset belongs to run ${JSON.stringify(offsetRunId)}, but the request names run ${JSON.stringify(requestedRunId)}`,
      )
    }

    return assertValidRunId(offsetRunId)
  }

  return requestedRunId === null
    ? crypto.randomUUID()
    : assertValidRunId(requestedRunId)
}

/**
 * Why a request asking to rejoin a run cannot be served, or `null` if it can.
 *
 * A resume names its run and its position in an offset this log minted, so the
 * log is the only thing that can judge either — an endpoint that pre-validated
 * one would have to restate the offset vocabulary to do it, and two readings
 * that drifted apart would refuse resumes this log would serve.
 *
 * The check is to resolve the run exactly as a real resume would and report
 * what that refuses. Resolution touches no database, so this costs nothing but
 * the parse it was always going to do.
 *
 * A rejection is the client's to fix, not a fault: it means the request
 * described a run this log cannot hand back.
 */
export function describeResumeRejection(request: Request) {
  const offset = resolveResumeOffset(request)

  // A positional offset names a position but not a run, so a request carrying
  // one and no run id says nothing about which run it wants. Left to resolve,
  // it mints a fresh id below and waits out a deadline against a run that never
  // existed; turn it away now instead. A request with no offset at all falls
  // through to the transport, which owns what a resume must carry.
  const isUnnamedRun =
    offset !== null &&
    !namesItsOwnRun(offset) &&
    resolveResumeRunId(request) === null

  if (isUnnamedRun) {
    return 'a resume must name a run: send runId (or an X-Run-Id header) alongside a positional offset'
  }

  try {
    streamStore(request)

    return null
  } catch (rejection) {
    return rejection instanceof Error ? rejection.message : String(rejection)
  }
}

async function readLogState(runId: string) {
  const [log] = await db
    .select({ closedAt: deliveryLogs.closedAt })
    .from(deliveryLogs)
    .where(eq(deliveryLogs.runId, runId))
    .limit(1)

  return log
}

async function readTailPosition(runId: string) {
  const [event] = await db
    .select({ id: deliveryLogEvents.id })
    .from(deliveryLogEvents)
    .where(eq(deliveryLogEvents.runId, runId))
    .orderBy(desc(deliveryLogEvents.id))
    .limit(1)

  return event?.id ?? 0
}

function readEventsAfter(runId: string, position: number) {
  return db
    .select({ id: deliveryLogEvents.id, chunk: deliveryLogEvents.chunk })
    .from(deliveryLogEvents)
    .where(
      and(
        eq(deliveryLogEvents.runId, runId),
        gt(deliveryLogEvents.id, position),
      ),
    )
    .orderBy(asc(deliveryLogEvents.id))
}

/** Wake every reader of this run — in this process and in any other. */
function notifyAppend(
  executor: Pick<typeof db, 'execute'>,
  runId: string,
): Promise<unknown> {
  return executor.execute(
    sql`select pg_notify(${appendNotificationChannel}, ${runId})`,
  )
}

/**
 * Open the log for one request.
 *
 * The declared return type is deliberately the narrow `StreamDurability`. The
 * optional upsert capability is not implemented and must not be leaked, so that
 * no caller can come to depend on a capability a future backend may not have.
 *
 * A resumer passes the request alone: which run it wants is written on the
 * request, as an offset that encodes its own run or an explicit run id.
 *
 * A producer passes the run it is starting, because that identity lives in the
 * request *body* and the request alone cannot reveal it. Left to the request, a
 * run would be logged under a minted id the client never learns — unrejoinable
 * from the moment it starts, silently.
 */
export function streamStore(
  request: Request,
  producedRunId?: string,
): StreamDurability {
  const isResume = producedRunId === undefined
  const resumeOffset = isResume ? resolveResumeOffset(request) : null
  const runId = isResume
    ? resolveRunId(request, resumeOffset)
    : assertValidRunId(producedRunId)

  return {
    resumeFrom: () => resumeOffset,

    append: async (chunks) => {
      if (chunks.length === 0) return []

      return db.transaction(async (transaction) => {
        // The log row and the events land together, so an event can never exist
        // for a run the log table has never heard of.
        await transaction
          .insert(deliveryLogs)
          .values({ runId })
          .onConflictDoNothing()

        const inserted = await transaction
          .insert(deliveryLogEvents)
          .values(
            chunks.map((chunk) => ({
              runId,
              chunk: withoutAccumulatedContent(chunk),
            })),
          )
          .returning({ id: deliveryLogEvents.id })

        // Inside the transaction, so the wake is delivered on commit — never
        // before the rows it announces are visible to the reader it wakes.
        await notifyAppend(transaction, runId)

        return inserted.map((event) => encodeOffset(runId, event.id))
      })
    },

    // Terminalisation is this call and nothing else. A terminal chunk does not
    // end a read: an agent-loop run emits one per iteration, so stopping at the
    // first would truncate a tool-calling run at its first tool call. Core
    // awaits this on every producer exit, including cancellation and failure.
    close: async () => {
      await db.transaction(async (transaction) => {
        await transaction
          .insert(deliveryLogs)
          .values({ runId, closedAt: new Date() })
          .onConflictDoUpdate({
            target: deliveryLogs.runId,
            // First close wins, so a second producer exit cannot move the
            // moment the log was terminalised.
            set: { closedAt: sql`coalesce(${deliveryLogs.closedAt}, now())` },
          })

        await notifyAppend(transaction, runId)
      })
    },

    // Everything stored right now, never a wait. An unknown run resolves to an
    // empty list rather than throwing — deliberately not read's unknown-run
    // failure path, which the library allows to fail and this may not.
    snapshot: async () => {
      const events = await readEventsAfter(runId, 0)

      return events.map((event) => ({
        offset: encodeOffset(runId, event.id),
        chunk: event.chunk,
      }))
    },

    read: async function* (offset, signal) {
      const isFromStartJoin = !namesItsOwnRun(offset)
      const log = await readLogState(runId)

      // Peek, never create. A concrete position for a run with no log means the
      // run is unknown: fail, and do not insert a row — an inserted row would
      // be a phantom log nothing ever terminalises or reclaims.
      if (log === undefined && !isFromStartJoin) {
        throw new Error(`Unknown run log: ${JSON.stringify(runId)}`)
      }

      let position = 0

      if (offset === FROM_TAIL_OFFSET) {
        position = await readTailPosition(runId)
      } else if (namesItsOwnRun(offset)) {
        const decoded = decodeOffset(offset)

        if (decoded.runId !== runId) {
          throw new Error(
            `Run log offset belongs to run ${JSON.stringify(decoded.runId)}, not ${JSON.stringify(runId)}`,
          )
        }

        position = decoded.position
      }

      // A tailing read that cannot learn about appends must not quietly wait
      // out its deadline, so a listener that will not connect fails the read.
      await ensureAppendListener()

      const watcher = watchRun(runId)

      try {
        for (;;) {
          // Read the log's state *before* its events: if it is closed at this
          // point, the events fetched next are necessarily the complete set.
          const state = await readLogState(runId)
          const events = await readEventsAfter(runId, position)

          for (const event of events) {
            position = event.id
            yield { offset: encodeOffset(runId, event.id), chunk: event.chunk }
          }

          if (state?.closedAt != null || signal?.aborted) return

          // A non-zero position means the log holds events, so this reader is
          // merely caught up rather than waiting on a run that may not exist.
          const logHasStoredEvents = position > 0

          // Never return empty while the producer is alive — an empty read ends
          // the response and reaches the user as "stream incomplete". Park.
          await watcher.wait(
            logHasStoredEvents
              ? {
                  timeoutMs: PRODUCER_SILENCE_TIMEOUT_MS,
                  timeoutMessage: `Run ${JSON.stringify(runId)} produced nothing for ${PRODUCER_SILENCE_TIMEOUT_MS}ms and its log was never closed. Its producer most likely died mid-run — the process that started it is gone, and no other process takes a run over.`,
                  signal,
                }
              : {
                  timeoutMs: FIRST_EVENT_DEADLINE_MS,
                  timeoutMessage: `Unknown or expired run log: ${JSON.stringify(runId)} stored nothing within ${FIRST_EVENT_DEADLINE_MS}ms.`,
                  signal,
                },
          )
        }
      } finally {
        watcher.dispose()
      }
    },
  } satisfies StreamDurability
}
