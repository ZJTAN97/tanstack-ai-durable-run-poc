import type { RunStatus } from '@tanstack/ai'
import { powerSyncCollectionOptions } from '@tanstack/powersync-db-collection'
import { BTreeIndex, createCollection } from '@tanstack/react-db'
import { z } from 'zod'

import { threadIdentifier } from '@/schema/thread'
import { powerSyncDatabase } from './database'
import { appSchema } from './schema'

// `satisfies` rather than a hand-written union: a status @tanstack/ai renames is
// a compile error here instead of a row that fails to deserialize at runtime.
const RUN_STATUSES = [
  'running',
  'interrupted',
  'completed',
  'failed',
  'aborted',
] as const satisfies ReadonlyArray<RunStatus>

const runStatusSchema = z.enum(RUN_STATUSES)

const tokenUsageSchema = z.looseObject({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
})

/** The JSON text PowerSync makes of a `jsonb` column, back into an object. */
const storedTokenUsageSchema = z
  .string()
  .nullable()
  .transform((value, context) => {
    if (value === null) return null

    try {
      return JSON.parse(value) as unknown
    } catch {
      context.addIssue({ code: 'custom', message: 'usage is not valid JSON' })
      return z.NEVER
    }
  })
  .pipe(tokenUsageSchema.nullable())

/**
 * Field names stay `snake_case` throughout. These are the synced row as it
 * exists in local SQLite, not a client-side model of it, and renaming on the way
 * in would put a translation layer between the sync rules and every query.
 */
const threadSchema = z.object({
  id: threadIdentifier,
  title: z.string().max(200).nullable(),
  updated_at: z.date().nullable(),
})

const runSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  status: runStatusSchema,
  started_at: z.number(),
  finished_at: z.number().nullable(),
  error: z.string().nullable(),
  usage: tokenUsageSchema.nullable(),
})

// The same shapes read from SQLite's types rather than the application's. This
// is the direction the sync stream travels, so it is where text becomes a Date
// and JSON text becomes an object.
const threadDeserializationSchema = threadSchema.extend({
  updated_at: z.coerce.date().nullable(),
})

const runDeserializationSchema = runSchema.extend({
  usage: storedTokenUsageSchema,
})

/**
 * A failure here means a synced row could not be applied, which is data
 * inconsistency rather than a display problem — so it is reported loudly and not
 * swallowed.
 */
function reportDeserializationFailure(table: string) {
  return (failure: { issues: ReadonlyArray<{ message: string }> }) => {
    console.error(
      `Sync delivered a ${table} row that could not be read:`,
      failure.issues.map((issue) => issue.message).join('; '),
    )
  }
}

/**
 * No `onInsert` / `onUpdate` / `onDelete`. Collection mutations go through
 * `PowerSyncTransactor` into local SQLite, and PowerSync's own upload queue owns
 * the round-trip to the server — so there is exactly one optimistic layer.
 * Adding mutation handlers would create a second one racing it.
 */
export const threadCollection = createCollection(
  powerSyncCollectionOptions({
    database: powerSyncDatabase,
    table: appSchema.props.chat_threads,
    schema: threadSchema,
    deserializationSchema: threadDeserializationSchema,
    onDeserializationError: reportDeserializationFailure('chat_threads'),
  }),
)

export const runCollection = createCollection(
  powerSyncCollectionOptions({
    database: powerSyncDatabase,
    table: appSchema.props.chat_runs,
    schema: runSchema,
    deserializationSchema: runDeserializationSchema,
    onDeserializationError: reportDeserializationFailure('chat_runs'),
  }),
)

// Both readers of this collection look runs up by thread — the list's join and
// the chat header. Without the index TanStack DB scans every run per query and
// says so.
runCollection.createIndex((run) => run.thread_id, { indexType: BTreeIndex })
