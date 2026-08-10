import { Client } from 'pg'
import { env } from '@/server/env'

/**
 * One channel for the whole process, with the run id travelling in the payload.
 *
 * Structurally this is the reference in-memory backend's waiter list, fed by the
 * database instead of by in-process appends — which is precisely what makes it
 * work when the producer is in another process.
 *
 * A channel per run was rejected: it would hold one connection per parked
 * reader, and would drag in Postgres' identifier length and character-set
 * constraints, which a payload does not have.
 */
const APPEND_CHANNEL = 'delivery_log_append'

type Waiter = () => void

// Cached on the global object for the same reason as the pool: Vite re-executes
// this module on every save, and a fresh listener connection per save would
// exhaust Postgres' connections within minutes. The waiter registry rides along
// so that a read parked across a hot reload is still woken by the new module's
// notifications.
const globalWithListener = globalThis as typeof globalThis & {
  durableRunAppendWaiters?: Map<string, Set<Waiter>>
  durableRunAppendListener?: Promise<Client>
}

globalWithListener.durableRunAppendWaiters ??= new Map()

const waitersByRun = globalWithListener.durableRunAppendWaiters

function wakeAll() {
  for (const waiters of waitersByRun.values()) {
    for (const wake of [...waiters]) wake()
  }
}

function connectListener() {
  const client = new Client({ connectionString: env.DATABASE_URL })
  let connecting: Promise<Client>

  // A dropped listener must not leave readers parked on a connection that will
  // never deliver again. Clear the cache so the next wait reconnects, and wake
  // everyone so they re-query and re-park through that reconnect.
  const forget = () => {
    if (globalWithListener.durableRunAppendListener === connecting) {
      globalWithListener.durableRunAppendListener = undefined
    }
    wakeAll()
  }

  client.on('error', forget)
  client.on('end', forget)
  client.on('notification', (message) => {
    const runId = message.payload
    if (runId === undefined) return
    for (const wake of [...(waitersByRun.get(runId) ?? [])]) wake()
  })

  connecting = client
    .connect()
    .then(() => client.query(`LISTEN ${APPEND_CHANNEL}`))
    .then(() => client)

  return connecting
}

/**
 * Ensure this process is listening before a reader parks.
 *
 * Awaited by the reader rather than fired and forgotten: a tailing read that
 * cannot learn about appends is not a read that should quietly wait out its
 * deadline, so a listener that will not connect fails the read with the reason.
 */
export async function ensureAppendListener() {
  globalWithListener.durableRunAppendListener ??= connectListener()

  const connecting = globalWithListener.durableRunAppendListener

  try {
    await connecting
  } catch (cause) {
    if (globalWithListener.durableRunAppendListener === connecting) {
      globalWithListener.durableRunAppendListener = undefined
    }
    throw cause
  }
}

/**
 * The SQL a writer runs, inside its own transaction, to wake this process's
 * readers — and every other process's — once the write commits.
 */
export const appendNotificationChannel = APPEND_CHANNEL

/**
 * Register interest in a run *before* querying it, so an append that lands
 * between the query and the park is not missed.
 */
export function watchRun(runId: string) {
  const waiters = waitersByRun.get(runId) ?? new Set<Waiter>()
  waitersByRun.set(runId, waiters)

  let notified = false
  let wakeCurrentWait: Waiter | undefined
  const onNotify = () => {
    notified = true
    wakeCurrentWait?.()
  }

  waiters.add(onNotify)

  return {
    // The timeout message is the caller's, not this module's: waiting out the
    // deadline for a run's very first event and waiting one out mid-run mean
    // entirely different things to whoever reads the error.
    wait: (park: {
      timeoutMs: number
      timeoutMessage: string
      signal: AbortSignal | undefined
    }) => {
      const { timeoutMs, timeoutMessage, signal } = park

      if (notified || signal?.aborted) {
        notified = false
        return Promise.resolve()
      }

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error(timeoutMessage))
        }, timeoutMs)

        const cleanup = () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', settle)
          wakeCurrentWait = undefined
        }
        const settle = () => {
          cleanup()
          notified = false
          resolve()
        }

        wakeCurrentWait = settle
        signal?.addEventListener('abort', settle, { once: true })
      })
    },
    dispose: () => {
      waiters.delete(onNotify)
      if (waiters.size === 0) waitersByRun.delete(runId)
    },
  }
}
