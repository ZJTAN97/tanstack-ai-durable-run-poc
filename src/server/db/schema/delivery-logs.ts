import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One row per run whose delivery log exists.
 *
 * This table belongs to *delivery durability* and nothing else. `closedAt` is
 * the terminalisation of the log — set by the producer's `close()` call, which
 * it makes on every exit including cancellation and failure. It is deliberately
 * not a run lifecycle status: a run's status is a property of the run record
 * that server-side conversation state owns, and merging the two would couple
 * the two layers the library keeps separate.
 *
 * A log with `closedAt` still null long after `startedAt` is the diagnosable
 * case: its producer died without closing, so no reader will ever see a clean
 * end. Readers bound their wait rather than parking on it forever.
 */
export const deliveryLogs = pgTable('delivery_logs', {
  runId: text('run_id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})
