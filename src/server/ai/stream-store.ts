import { type StreamChunk, type StreamDurability } from '@tanstack/ai'
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'
import {
  appendNotificationChannel,
  ensureAppendListener,
  watchRun,
} from '@/server/ai/append-notifications'
import {
  PRODUCER_SILENCE_TIMEOUT_MS,
  sweepExpiredDeliveryLogs,
} from '@/server/ai/delivery-log-lifetimes'
import { db } from '@/server/db/client'
import { deliveryLogEvents } from '@/server/db/schema/delivery-log-events'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'

const OFFSET_PREFIX = 'pg:v1:'
const FROM_START_OFFSET = '-1'
const FROM_TAIL_OFFSET = 'now'
const FIRST_EVENT_DEADLINE_MS = 1_000

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

function withoutAccumulatedContent(chunk: StreamChunk): StreamChunk {
  const isRebuildableFromDeltas =
    'content' in chunk && typeof chunk.delta === 'string' && chunk.delta !== ''

  if (!isRebuildableFromDeltas) return chunk

  const { content: _accumulated, ...chunkToSave } = chunk

  return chunkToSave as StreamChunk
}

function namesItsOwnRun(offset: string | null): offset is string {
  return (
    offset !== null &&
    offset !== FROM_START_OFFSET &&
    offset !== FROM_TAIL_OFFSET
  )
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

export function streamStore(
  request: Request,
  producedRunId?: string,
): StreamDurability {
  const url = new URL(request.url)

  const resumeFrom =
    request.headers.get('Last-Event-ID') ?? url.searchParams.get('offset')

  if (producedRunId !== undefined && producedRunId.length === 0) {
    throw new Error('Invalid runId: a run id must not be empty')
  }

  const runId =
    producedRunId ??
    request.headers.get('X-Run-Id') ??
    url.searchParams.get('runId')

  if (runId === null) {
    throw new Error(
      'a runId is required: send it as an X-Run-Id header or a ?runId query param',
    )
  }

  return {
    resumeFrom: () => resumeFrom,
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
        await transaction.execute(
          sql`select pg_notify(${appendNotificationChannel}, ${runId})`,
        )

        return inserted.map((event) => encodeOffset(runId, event.id))
      })
    },

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

        await transaction.execute(
          sql`select pg_notify(${appendNotificationChannel}, ${runId})`,
        )
      })

      void sweepExpiredDeliveryLogs().catch((failure) => {
        console.error('[delivery-log] sweep failed', failure)
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
