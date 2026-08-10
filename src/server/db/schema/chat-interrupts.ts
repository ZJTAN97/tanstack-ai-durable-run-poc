import type { InterruptRecord } from '@tanstack/ai-persistence'
import { bigint, jsonb, pgTable, text } from 'drizzle-orm/pg-core'

/**
 * Human-in-the-loop interrupts, one row each.
 *
 * The table exists because the store contracts come as a set and half of one is
 * worse than none. No tool is defined and no approval is wired in this POC, so
 * nothing writes here yet.
 */
export const chatInterrupts = pgTable('chat_interrupts', {
  interruptId: text('interrupt_id').primaryKey(),
  runId: text('run_id').notNull(),
  threadId: text('thread_id').notNull(),
  status: text('status').$type<InterruptRecord['status']>().notNull(),
  requestedAt: bigint('requested_at', { mode: 'number' }).notNull(),
  resolvedAt: bigint('resolved_at', { mode: 'number' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  response: jsonb('response').$type<unknown>(),
})
