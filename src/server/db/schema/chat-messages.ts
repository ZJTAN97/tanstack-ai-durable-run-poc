import type { ModelMessage } from '@tanstack/ai'
import {
  bigserial,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { chatThreads } from '@/server/db/schema/chat-threads'

/**
 * The server's copy of a conversation: one row per message.
 *
 * The message itself is stored whole in `message`, with only the fields worth
 * querying projected beside it. A message's content is a union of a string,
 * null, and a list of parts from a wide, provider-extensible set — decomposing
 * it into columns would lose a field the moment the library adds one, and would
 * have to reconstruct the difference between a stored null and an absent value
 * on the way out. Storing it whole makes the round-trip exact by construction;
 * reach into the JSON for anything the projected columns do not cover.
 *
 * `position` is required rather than implied: the save path rewrites a thread's
 * rows on every turn, so insertion order is not stable, and two messages of one
 * turn can share a millisecond. It is unique per thread.
 *
 * `messageId` is the library's own optional message id. It is a different
 * identifier with a different lifetime from `id`, which is ours: `id` is stable
 * and always present, `messageId` may legitimately be absent, and neither is a
 * substitute for the other.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.threadId, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    role: text('role').$type<ModelMessage['role']>().notNull(),
    messageId: text('message_id'),
    message: jsonb('message').$type<ModelMessage>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('chat_messages_thread_position_uq').on(
      table.threadId,
      table.position,
    ),
  ],
)
