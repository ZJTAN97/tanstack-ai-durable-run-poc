import type { ModelMessage } from '@tanstack/ai'
import type {
  ChatPersistence,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { chatInterrupts } from '@/server/db/schema/chat-interrupts'
import { chatMessages } from '@/server/db/schema/chat-messages'
import { chatMetadata } from '@/server/db/schema/chat-metadata'
import { chatRuns } from '@/server/db/schema/chat-runs'
import { chatThreads } from '@/server/db/schema/chat-threads'

/**
 * The server's own copy of the conversation, in Postgres.
 *
 * This is the single seam for conversation state: the chat endpoint hands this
 * value to the persistence middleware and knows nothing about what is behind
 * it. It is a different layer from the delivery log — that records the stream
 * events of one run, this records the messages of a conversation — and the two
 * deliberately share no code.
 *
 * This copy is authoritative, and `reconstructChat` on the endpoint's GET is
 * what reads it back: the client caches nothing and paints what `loadThread`
 * returns. A save is still a full overwrite driven by the transcript the client
 * posted, because that is the contract the middleware implements — the shift is
 * in who is believed on load, not in how a turn is written.
 *
 * Every rule marked below is one the library's conformance kit checks. That kit
 * is not run here — the project has no test framework — so these are the places
 * to look first if the adapter ever misbehaves.
 */

// Records omit absent optionals rather than materialising them as nulls, so
// they compare cleanly against the library's reference in-memory backend.
function mapRun(row: typeof chatRuns.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt !== null ? { finishedAt: row.finishedAt } : {}),
    ...(row.error !== null
      ? {
          error: {
            message: row.error,
            ...(row.errorCode !== null ? { code: row.errorCode } : {}),
          },
        }
      : {}),
    ...(row.usage !== null ? { usage: row.usage } : {}),
    ...(row.sandboxKey !== null ? { sandboxKey: row.sandboxKey } : {}),
    ...(row.detachedSince !== null ? { detachedSince: row.detachedSince } : {}),
    ...(row.cancelRequested !== null
      ? { cancelRequested: row.cancelRequested }
      : {}),
    ...(row.driverEpoch !== null ? { driverEpoch: row.driverEpoch } : {}),
  }
}

function mapInterrupt(
  row: typeof chatInterrupts.$inferSelect,
): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    requestedAt: row.requestedAt,
    payload: row.payload,
    ...(row.resolvedAt !== null ? { resolvedAt: row.resolvedAt } : {}),
    ...(row.response !== null ? { response: row.response } : {}),
  }
}

const TITLE_MAX_LENGTH = 80

// A message's content is a string, null, or a list of parts, and only the text
// parts can name a conversation — an opening turn that is a single image has
// nothing to read off.
function readMessageText(message: ModelMessage) {
  if (typeof message.content === 'string') return message.content
  if (message.content === null) return ''

  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join(' ')
}

/**
 * What the thread list calls this conversation: its opening question, shortened.
 *
 * Derived rather than asked for, because a POC that stops to demand a name
 * before the first message is a POC nobody finishes using. It is recomputed on
 * every save, which is free here — the first user message does not change, so
 * the same title is rewritten — and means a thread cannot keep a title belonging
 * to a transcript it no longer has.
 */
function deriveThreadTitle(messages: Array<ModelMessage>) {
  const opening = messages.find((message) => message.role === 'user')
  if (opening === undefined) return null

  const text = readMessageText(opening).replace(/\s+/g, ' ').trim()
  if (text === '') return null

  return text.length > TITLE_MAX_LENGTH
    ? `${text.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`
    : text
}

const messageStore: MessageStore = {
  async loadThread(threadId) {
    const rows = await db
      .select({ message: chatMessages.message })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.position))

    // An unknown thread is [], never null.
    return rows.map((row) => row.message)
  },

  // A save is a full overwrite: `messages` is the complete authoritative
  // transcript, with no diff information, so the thread's rows are rewritten.
  // One transaction, because a thread holding half a conversation must never be
  // observable.
  async saveThread(threadId, messages) {
    const title = deriveThreadTitle(messages)

    await db.transaction(async (transaction) => {
      await transaction
        .insert(chatThreads)
        .values({ threadId, title, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: chatThreads.threadId,
          set: { title, updatedAt: new Date() },
        })

      await transaction
        .delete(chatMessages)
        .where(eq(chatMessages.threadId, threadId))

      if (messages.length === 0) return

      await transaction.insert(chatMessages).values(
        messages.map((message, position) => ({
          threadId,
          position,
          role: message.role,
          messageId: message.id ?? null,
          message,
        })),
      )
    })
  },
}

async function getRun(runId: string) {
  const rows = await db
    .select()
    .from(chatRuns)
    .where(eq(chatRuns.runId, runId))
    .limit(1)

  return rows[0] ? mapRun(rows[0]) : null
}

const runStore: RunStore = {
  get: getRun,

  // Idempotent: an existing runId is returned untouched, so a resume or a
  // double submit cannot clobber recorded state.
  async createOrResume({ runId, threadId, startedAt, status }) {
    const existing = await getRun(runId)
    if (existing) return existing

    await db
      .insert(chatRuns)
      .values({ runId, threadId, status: status ?? 'running', startedAt })
      .onConflictDoNothing({ target: chatRuns.runId })

    // Re-read rather than trusting the insert: a concurrent createOrResume may
    // have won the race, and that row is the authoritative one.
    const stored = await getRun(runId)
    return stored ?? { runId, threadId, status: status ?? 'running', startedAt }
  },

  // Patching an unknown runId is a no-op: it must neither throw nor insert.
  async update(runId, patch) {
    const set: Partial<typeof chatRuns.$inferInsert> = {}

    if (patch.status !== undefined) set.status = patch.status
    if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt
    // Both columns move together, so a later code-less failure cannot leave a
    // stale errorCode from an earlier one behind.
    if (patch.error !== undefined) {
      set.error = patch.error.message
      set.errorCode = patch.error.code ?? null
    }
    if (patch.usage !== undefined) set.usage = patch.usage

    // These four test for the key's *presence*, not for a defined value: a
    // reattach clears `detachedSince` by passing it explicitly as undefined,
    // and that must still write NULL. `!== undefined` cannot tell "clear this"
    // from "did not mention this", so it would drop the clear and leave the run
    // looking permanently detached. `cancelRequested` reasons the same way —
    // `false` is a meaningful value, not "unset".
    if ('sandboxKey' in patch) set.sandboxKey = patch.sandboxKey ?? null
    if ('detachedSince' in patch)
      set.detachedSince = patch.detachedSince ?? null
    if ('cancelRequested' in patch)
      set.cancelRequested = patch.cancelRequested ?? null
    if ('driverEpoch' in patch) set.driverEpoch = patch.driverEpoch ?? null

    if (Object.keys(set).length === 0) return

    await db.update(chatRuns).set(set).where(eq(chatRuns.runId, runId))
  },

  async findActiveRun(threadId) {
    const rows = await db
      .select()
      .from(chatRuns)
      .where(
        and(eq(chatRuns.threadId, threadId), eq(chatRuns.status, 'running')),
      )
      .orderBy(desc(chatRuns.startedAt))
      .limit(1)

    return rows[0] ? mapRun(rows[0]) : null
  },

  async listByThread(threadId) {
    const rows = await db
      .select()
      .from(chatRuns)
      .where(eq(chatRuns.threadId, threadId))
      .orderBy(asc(chatRuns.startedAt))

    return rows.map(mapRun)
  },

  // Still-running runs detached at or before the cutoff, which is inclusive.
  async listReclaimable({ now, ttlMs }) {
    const cutoff = now - ttlMs
    const rows = await db
      .select()
      .from(chatRuns)
      .where(
        and(
          eq(chatRuns.status, 'running'),
          isNotNull(chatRuns.detachedSince),
          lte(chatRuns.detachedSince, cutoff),
        ),
      )

    return rows.map(mapRun)
  },
}

async function listInterruptsWhere(where: SQL | undefined) {
  const rows = await db
    .select()
    .from(chatInterrupts)
    .where(where)
    .orderBy(asc(chatInterrupts.requestedAt))

  return rows.map(mapInterrupt)
}

const interruptStore: InterruptStore = {
  // Insert-if-absent: a duplicate create must never reset a resolved interrupt
  // back to pending.
  async create(record) {
    await db
      .insert(chatInterrupts)
      .values({
        interruptId: record.interruptId,
        runId: record.runId,
        threadId: record.threadId,
        status: 'pending',
        requestedAt: record.requestedAt,
        payload: record.payload,
        ...(record.response !== undefined ? { response: record.response } : {}),
      })
      .onConflictDoNothing({ target: chatInterrupts.interruptId })
  },

  async resolve(interruptId, response) {
    await db
      .update(chatInterrupts)
      .set({
        status: 'resolved',
        resolvedAt: Date.now(),
        ...(response !== undefined ? { response } : {}),
      })
      .where(eq(chatInterrupts.interruptId, interruptId))
  },

  async cancel(interruptId) {
    await db
      .update(chatInterrupts)
      .set({ status: 'cancelled', resolvedAt: Date.now() })
      .where(eq(chatInterrupts.interruptId, interruptId))
  },

  async get(interruptId) {
    const rows = await db
      .select()
      .from(chatInterrupts)
      .where(eq(chatInterrupts.interruptId, interruptId))
      .limit(1)

    return rows[0] ? mapInterrupt(rows[0]) : null
  },

  list: (threadId) =>
    listInterruptsWhere(eq(chatInterrupts.threadId, threadId)),
  listPending: (threadId) =>
    listInterruptsWhere(
      and(
        eq(chatInterrupts.threadId, threadId),
        eq(chatInterrupts.status, 'pending'),
      ),
    ),
  listByRun: (runId) => listInterruptsWhere(eq(chatInterrupts.runId, runId)),
  listPendingByRun: (runId) =>
    listInterruptsWhere(
      and(
        eq(chatInterrupts.runId, runId),
        eq(chatInterrupts.status, 'pending'),
      ),
    ),
}

const metadataStore: MetadataStore = {
  async get(namespace, key) {
    const rows = await db
      .select({ value: chatMetadata.value })
      .from(chatMetadata)
      .where(
        and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key)),
      )
      .limit(1)

    return rows[0]?.value ?? null
  },

  async set(namespace, key, value) {
    // A JSON column binds JS null as SQL NULL, which the NOT NULL column
    // rejects with an opaque driver error. Say what is wrong instead.
    if (value === null || value === undefined) {
      throw new TypeError(
        `Cannot store ${value} for (${namespace}, ${key}) — use delete() to clear metadata.`,
      )
    }

    await db
      .insert(chatMetadata)
      .values({ namespace, key, value })
      .onConflictDoUpdate({
        target: [chatMetadata.namespace, chatMetadata.key],
        set: { value },
      })
  },

  async delete(namespace, key) {
    await db
      .delete(chatMetadata)
      .where(
        and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key)),
      )
  },
}

// Annotated as the full chat persistence shape rather than the library's
// all-optional bag: the middleware rejects the latter, because a possibly
// undefined message store is not one it can drive.
export const chatPersistence: ChatPersistence = defineAIPersistence({
  stores: {
    messages: messageStore,
    runs: runStore,
    interrupts: interruptStore,
    metadata: metadataStore,
  },
})
