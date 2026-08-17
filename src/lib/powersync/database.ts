import { PowerSyncDatabase } from '@powersync/web'

import { connector } from './connector'
import { appSchema } from './schema'

/**
 * The device's local copy of what Sync carries.
 *
 * A module singleton, which is safe because the app runs in SPA mode: this
 * module is only ever evaluated in a browser, so there is no server render to
 * guard against and no per-request instance to scope.
 *
 * Opening it is `init()`, which the root route awaits — that is local SQLite and
 * fast. `connect()` is the network and is deliberately not awaited anywhere.
 */
export const powerSyncDatabase = new PowerSyncDatabase({
  schema: appSchema,
  database: { dbFilename: 'durable-run-poc.sqlite' },
})

// The constructor starts initialisation itself, so this module has a promise in
// flight the moment it is imported — including in the SSR build that renders the
// SPA shell, where @powersync/web substitutes a mock adapter whose transaction
// context is missing `execute` (a bug in 1.39.1). Nothing on the server reads
// this database, but an unhandled rejection there takes the render down. This
// claims the rejection and nothing else: `openLocalDatabase` awaits the same
// promise, so a genuine failure in the browser still surfaces there.
void powerSyncDatabase.waitForReady().catch(() => {})

let opening: Promise<void> | null = null

/**
 * Open the local database, then start replicating in the background.
 *
 * Awaiting the returned promise waits for local SQLite only. `connect()` is
 * deliberately left running — blocking the first render on the network is
 * exactly what an offline-tolerant app must not do, and a device with no
 * connection would never render at all.
 *
 * Memoised because the root route's loader may run more than once, and a second
 * `connect()` would open a second sync session against the same database.
 */
export function openLocalDatabase() {
  opening ??= powerSyncDatabase.init().then(() => {
    void powerSyncDatabase.connect(connector)
  })

  return opening
}
