import type { StreamChunk } from '@tanstack/ai'
import { bigserial, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'

/**
 * The append-only run log. One row per stream chunk, in append order.
 *
 * `id` is the cursor. It comes from a single database-wide sequence rather than
 * a per-run counter: the library requires only that positions increase within a
 * run — it explicitly warns against renumbering them to be contiguous — so a
 * shared sequence satisfies the contract while removing the per-run counter and
 * its allocation race entirely. (This is a property of one database. Partition
 * or shard this table and the offset scheme needs revisiting, which is why the
 * wire offset carries a version prefix.)
 *
 * `chunk` stores the library's chunk verbatim, so a future library version that
 * adds a field does not silently lose it on the way through our log.
 *
 * The log grows without bound. Retention is out of scope for the POC.
 */
export const deliveryLogEvents = pgTable(
  'delivery_log_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => deliveryLogs.runId, { onDelete: 'cascade' }),
    chunk: jsonb('chunk').$type<StreamChunk>().notNull(),
  },
  (table) => [
    index('delivery_log_events_run_id_id_idx').on(table.runId, table.id),
  ],
)
