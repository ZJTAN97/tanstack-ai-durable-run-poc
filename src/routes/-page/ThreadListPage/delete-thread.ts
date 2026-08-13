import { createServerFn } from '@tanstack/react-start'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { threadIdentifier } from '@/schema/thread'
import { db } from '@/server/db/client'
import { chatInterrupts } from '@/server/db/schema/chat-interrupts'
import { chatRuns } from '@/server/db/schema/chat-runs'
import { chatThreads } from '@/server/db/schema/chat-threads'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'

/**
 * Forget a conversation entirely — transcript, run history, and delivery logs.
 *
 * Four statements rather than one because only one of these tables is bound to
 * the thread by a foreign key: `chat_messages` cascades from the thread row, but
 * `chat_runs` and `chat_interrupts` merely carry a `thread_id` column, and
 * `delivery_logs` is keyed by run. Deleting the thread alone would leave the
 * run rows and their replayable chunk logs behind, still holding what the user
 * asked to be rid of. One transaction so a partial forget is not a state the
 * database can be left in.
 *
 * Deleting a thread whose run is still generating is allowed and takes the log
 * out from under the producer, which then fails on its next append. That is the
 * intent — a delete asked for mid-reply is a delete — and the run's own
 * lifecycle record goes with it in the same transaction.
 *
 * No ownership check, for the same reason `listThreads` has no filter: the POC
 * has no sessions. Here that absence is sharper, because this endpoint destroys.
 */
export const deleteThread = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ threadId: threadIdentifier }))
  .handler(async ({ data }) => {
    await db.transaction(async (transaction) => {
      const runs = await transaction
        .select({ runId: chatRuns.runId })
        .from(chatRuns)
        .where(eq(chatRuns.threadId, data.threadId))

      const runIds = runs.map((run) => run.runId)

      if (runIds.length > 0) {
        // The event rows follow via `delivery_log_events`' own cascade.
        await transaction
          .delete(deliveryLogs)
          .where(inArray(deliveryLogs.runId, runIds))
      }

      await transaction
        .delete(chatInterrupts)
        .where(eq(chatInterrupts.threadId, data.threadId))

      await transaction
        .delete(chatRuns)
        .where(eq(chatRuns.threadId, data.threadId))

      await transaction
        .delete(chatThreads)
        .where(eq(chatThreads.threadId, data.threadId))
    })
  })
