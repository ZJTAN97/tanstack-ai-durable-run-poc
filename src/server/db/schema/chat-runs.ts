import type { RunStatus, TokenUsage } from '@tanstack/ai'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'

/**
 * A run's lifecycle: whether the turn completed, failed, or was aborted, how
 * long it took, and what it cost.
 *
 * Deliberately separate from `delivery_logs`, which records whether a delivery
 * log was terminalised. Those are different questions about different layers,
 * and merging them would couple the two layers the library keeps apart.
 *
 * Timestamps here are epoch milliseconds because the store contract speaks in
 * them, not because the delivery tables' `timestamptz` was wrong.
 *
 * `error` and `errorCode` are the structured `RunError` split in two, so an
 * operator can filter on a stable code rather than provider prose. They always
 * move together on update: a later code-less failure must not leave a stale
 * code from an earlier one behind.
 */
export const chatRuns = pgTable(
  'chat_runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').$type<RunStatus>().notNull(),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    finishedAt: bigint('finished_at', { mode: 'number' }),
    error: text('error'),
    errorCode: text('error_code'),
    usage: jsonb('usage').$type<TokenUsage>(),
    sandboxKey: text('sandbox_key'),
    detachedSince: bigint('detached_since', { mode: 'number' }),
    cancelRequested: boolean('cancel_requested'),
    driverEpoch: integer('driver_epoch'),
  },
  (table) => [
    // Powers listReclaimable: status = 'running' AND detachedSince <= cutoff.
    index('chat_runs_status_detached_idx').on(
      table.status,
      table.detachedSince,
    ),
    // Powers findActiveRun and listByThread.
    index('chat_runs_thread_started_idx').on(table.threadId, table.startedAt),
  ],
)
