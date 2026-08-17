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
 * `title` is nullable because a thread exists from the moment it is created,
 * which is before anyone has said anything to name it. It is the name a user
 * gave, and nothing derives it: the server never writes it, and a save leaves
 * whatever is stored alone. A thread with no title is untitled, and "Untitled"
 * on screen is a display fallback rather than a stored value.
 *
 * `userId` exists for sync bucketing — it is what resolves which threads a
 * device replicates — and is stamped server-side from the presented token. A
 * device never states who it is. Runs carry no equivalent column: their owner
 * is knowable only through their thread.
 */
export const chatThreads = pgTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  title: text('title'),
  userId: text('user_id').notNull().default('anonymous'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
