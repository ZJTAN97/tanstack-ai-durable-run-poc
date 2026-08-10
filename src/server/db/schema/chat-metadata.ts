import { jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

/**
 * App-owned JSON keyed by `(namespace, key)`.
 *
 * The two parts are independent columns rather than one delimited string: a
 * `${namespace}:${key}` key collides the moment either part contains a colon.
 */
export const chatMetadata = pgTable(
  'chat_metadata',
  {
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.namespace, table.key] })],
)
