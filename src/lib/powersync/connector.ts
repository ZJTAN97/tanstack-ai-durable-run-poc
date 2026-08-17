import type { CrudEntry, PowerSyncBackendConnector } from '@powersync/web'
import { UpdateType } from '@powersync/web'
import { z } from 'zod'

const credentialsSchema = z.object({
  endpoint: z.url(),
  token: z.string().min(1),
})

async function fetchCredentials() {
  const response = await fetch('/api/powersync-token')

  if (!response.ok) {
    throw new Error(`Could not mint a sync token (${response.status}).`)
  }

  return credentialsSchema.parse(await response.json())
}

/**
 * One local change in the wire shape src/server/powersync/thread-writes.ts
 * accepts. A DELETE carries no `data` at all, because the schema there is strict
 * and an empty object is still an object it would have to allow.
 */
function toWrite(entry: CrudEntry) {
  if (entry.op === UpdateType.DELETE) {
    return { op: entry.op, table: entry.table, id: entry.id }
  }

  return { op: entry.op, table: entry.table, id: entry.id, data: entry.opData }
}

export const connector: PowerSyncBackendConnector = {
  fetchCredentials,

  async uploadData(database) {
    const batch = await database.getCrudBatch()
    if (batch === null) return

    const { token } = await fetchCredentials()

    const response = await fetch('/api/powersync-upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ writes: batch.crud.map(toWrite) }),
    })

    // Throwing leaves the batch in the local queue for PowerSync to retry, which
    // is the whole reason this is not a fire-and-forget POST: a write made
    // offline has to survive until the server has actually taken it.
    if (!response.ok) {
      throw new Error(`Sync upload rejected (${response.status}).`)
    }

    await batch.complete()
  },
}
