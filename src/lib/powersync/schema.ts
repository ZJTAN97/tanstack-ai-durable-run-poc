import { DrizzleAppSchema } from '@powersync/drizzle-driver'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { chatRuns } from '@/server/db/schema/chat-runs'
import type { chatThreads } from '@/server/db/schema/chat-threads'

/**
 * The local SQLite shape of what Sync carries.
 *
 * Hand-written rather than derived: `DrizzleAppSchema` consumes
 * `drizzle-orm/sqlite-core` tables, and the source of truth is a `pgTable`, so
 * there is no mechanical path between them. The guard at the bottom of this file
 * is what stands in for that path.
 *
 * Columns must match what powersync/sync-rules.yaml selects, including the
 * `thread_id AS id` / `run_id AS id` aliasing. PowerSync's failure mode for a
 * column it cannot resolve is a silent `null`, not an error.
 */
export const syncedChatThreads = sqliteTable('chat_threads', {
  id: text('id').primaryKey(),
  title: text('title'),
  // timestamptz arrives as ISO-8601 text; SQLite has no date type.
  updated_at: text('updated_at'),
})

export const syncedChatRuns = sqliteTable('chat_runs', {
  id: text('id').primaryKey(),
  thread_id: text('thread_id'),
  status: text('status'),
  started_at: integer('started_at'),
  finished_at: integer('finished_at'),
  error: text('error'),
  // jsonb arrives as the serialized JSON text.
  usage: text('usage'),
})

export const appSchema = new DrizzleAppSchema({
  chat_threads: syncedChatThreads,
  chat_runs: syncedChatRuns,
})

type AnyDrizzleTable = {
  _: { columns: Record<string, { _: { name: string } }> }
}

/** The union of a Drizzle table's SQL column names, not its JS property names. */
type SqlColumnNames<TTable extends AnyDrizzleTable> = {
  [Key in keyof TTable['_']['columns']]: TTable['_']['columns'][Key]['_']['name']
}[keyof TTable['_']['columns']]

/**
 * Mirror columns that name nothing in Postgres, with the synthetic `id` swapped
 * back for the primary key it aliases.
 *
 * Containment rather than equality: the run mirror is deliberately narrower than
 * `chat_runs`, because the reclaim columns have no reader on the client. What
 * must never happen is the reverse — a mirror column that Postgres has renamed
 * or dropped, which syncs as `null` and looks like missing data rather than a
 * bug.
 */
type ColumnsMissingFromPostgres<
  TMirror extends AnyDrizzleTable,
  TPostgres extends AnyDrizzleTable,
  TAliasedPrimaryKey extends string,
> = Exclude<
  Exclude<SqlColumnNames<TMirror>, 'id'> | TAliasedPrimaryKey,
  SqlColumnNames<TPostgres>
>

/** Fails to compile unless the union is empty. */
type AssertNone<TColumns extends never> = TColumns

export type ThreadMirrorIsFaithful = AssertNone<
  ColumnsMissingFromPostgres<
    typeof syncedChatThreads,
    typeof chatThreads,
    'thread_id'
  >
>

export type RunMirrorIsFaithful = AssertNone<
  ColumnsMissingFromPostgres<typeof syncedChatRuns, typeof chatRuns, 'run_id'>
>
