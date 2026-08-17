import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { threadIdentifier } from '@/schema/thread'
import { db } from '@/server/db/client'
import { chatInterrupts } from '@/server/db/schema/chat-interrupts'
import { chatRuns } from '@/server/db/schema/chat-runs'
import { chatThreads } from '@/server/db/schema/chat-threads'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'

/**
 * The only writes Sync is allowed to carry back to Postgres.
 *
 * `uploadData` runs in the browser and posts whatever shape we choose, so the
 * wire format is ours to define — and defining it strictly is what turns "runs
 * are read-only on the client" from a convention into something the server
 * enforces. `table` is a literal, so an operation naming `chat_runs` fails to
 * parse rather than reaching a handler that has to remember to refuse it.
 *
 * The column whitelists are equally load-bearing: `title` is the only value any
 * handler reads, `user_id` is rejected outright, and the server stamps both
 * `user_id` and `updated_at` itself. A client cannot forge either.
 */

/**
 * Accepted and discarded.
 *
 * A local write goes through the whole row, so the timestamp the device last saw
 * comes back up whether or not anyone touched it. Rejecting it would make rename
 * impossible; reading it would make the server's clock advisory. Neither.
 */
const echoedServerTimestamp = z.string().nullable().optional()

export const threadWriteSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('PUT'),
    table: z.literal('chat_threads'),
    id: threadIdentifier,
    // A thread is created before it is named, so a new row usually carries no
    // title at all.
    data: z.strictObject({
      title: z.string().max(200).nullable().optional(),
      updated_at: echoedServerTimestamp,
    }),
  }),
  z.strictObject({
    op: z.literal('PATCH'),
    table: z.literal('chat_threads'),
    id: threadIdentifier,
    data: z.strictObject({
      title: z.string().max(200).nullable(),
      updated_at: echoedServerTimestamp,
    }),
  }),
  z.strictObject({
    op: z.literal('DELETE'),
    table: z.literal('chat_threads'),
    id: threadIdentifier,
  }),
])

export type ThreadWrite = z.infer<typeof threadWriteSchema>

/**
 * Forget a conversation entirely — transcript, run history, and delivery logs.
 *
 * Four statements rather than one because only one of these tables is bound to
 * the thread by a foreign key: `chat_messages` cascades from the thread row, but
 * `chat_runs` and `chat_interrupts` merely carry a `thread_id` column, and
 * `delivery_logs` is keyed by run. Deleting the thread alone would leave the run
 * rows and their replayable chunk logs behind, still holding what the user asked
 * to be rid of. One transaction so a partial forget is not a state the database
 * can be left in.
 *
 * Deleting a thread whose run is still generating is allowed and takes the log
 * out from under the producer, which then fails on its next append. That is the
 * intent — a delete asked for mid-reply is a delete.
 */
async function deleteThread(threadId: string, ownerId: string) {
  await db.transaction(async (transaction) => {
    const owned = await transaction
      .select({ threadId: chatThreads.threadId })
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.threadId, threadId),
          eq(chatThreads.userId, ownerId),
        ),
      )
      .limit(1)

    if (owned.length === 0) return

    const runs = await transaction
      .select({ runId: chatRuns.runId })
      .from(chatRuns)
      .where(eq(chatRuns.threadId, threadId))

    const runIds = runs.map((run) => run.runId)

    if (runIds.length > 0) {
      // The event rows follow via `delivery_log_events`' own cascade.
      await transaction
        .delete(deliveryLogs)
        .where(inArray(deliveryLogs.runId, runIds))
    }

    await transaction
      .delete(chatInterrupts)
      .where(eq(chatInterrupts.threadId, threadId))

    await transaction.delete(chatRuns).where(eq(chatRuns.threadId, threadId))

    await transaction
      .delete(chatThreads)
      .where(eq(chatThreads.threadId, threadId))
  })
}

/**
 * Apply one uploaded operation, attributing it to the verified token subject.
 *
 * Every path is scoped to `ownerId`, including the conflict branch of the
 * insert: a replayed PUT for a thread someone else owns must not become a way to
 * rename it or take it over.
 */
export async function applyThreadWrite(write: ThreadWrite, ownerId: string) {
  if (write.op === 'DELETE') {
    await deleteThread(write.id, ownerId)
    return
  }

  const writtenAt = new Date()

  if (write.op === 'PATCH') {
    await db
      .update(chatThreads)
      .set({ title: write.data.title, updatedAt: writtenAt })
      .where(
        and(
          eq(chatThreads.threadId, write.id),
          eq(chatThreads.userId, ownerId),
        ),
      )
    return
  }

  await db
    .insert(chatThreads)
    .values({
      threadId: write.id,
      title: write.data.title ?? null,
      userId: ownerId,
      updatedAt: writtenAt,
    })
    .onConflictDoUpdate({
      target: chatThreads.threadId,
      set: { title: write.data.title ?? null, updatedAt: writtenAt },
      setWhere: eq(chatThreads.userId, ownerId),
    })
}
