import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One row per conversation the server holds a transcript for.
 *
 * The parent record exists so a thread has an identity of its own rather than
 * being implied by the messages that happen to reference it: deleting it takes
 * the message rows with it, and `updatedAt` answers "when was this thread last
 * written" without scanning them.
 *
 * `updatedAt` is ours, not the library's — the stores never read columns they
 * do not know about.
 */
export const chatThreads = pgTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
