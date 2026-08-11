import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One row per conversation the server holds a transcript for.
 *
 * The parent record exists so a thread has an identity of its own rather than
 * being implied by the messages that happen to reference it: deleting it takes
 * the message rows with it, and `updatedAt` answers "when was this thread last
 * written" without scanning them.
 *
 * `updatedAt` and `title` are ours, not the library's — the stores never read
 * columns they do not know about.
 *
 * `title` is nullable because a thread exists from the moment it is addressed,
 * which is before anyone has said anything to name it. It is derived from the
 * conversation rather than typed, so it is a cache of the transcript and not an
 * independent fact — the write path recomputes it on every save rather than
 * treating the stored value as authoritative.
 */
export const chatThreads = pgTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  title: text('title'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
