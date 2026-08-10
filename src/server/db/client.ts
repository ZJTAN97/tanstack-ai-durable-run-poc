import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { chatInterrupts } from '@/server/db/schema/chat-interrupts'
import { chatMessages } from '@/server/db/schema/chat-messages'
import { chatMetadata } from '@/server/db/schema/chat-metadata'
import { chatRuns } from '@/server/db/schema/chat-runs'
import { chatThreads } from '@/server/db/schema/chat-threads'
import { deliveryLogEvents } from '@/server/db/schema/delivery-log-events'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'
import { env } from '@/server/env'

const schema = {
  deliveryLogs,
  deliveryLogEvents,
  chatThreads,
  chatMessages,
  chatRuns,
  chatInterrupts,
  chatMetadata,
}

// Vite re-executes this module on every save in development, so without a cache
// on the global object each hot reload would leak a pool and Postgres would
// refuse connections within minutes. This is external-resource lifecycle
// management, not premature optimisation.
const globalWithPool = globalThis as typeof globalThis & {
  durableRunPool?: Pool
}

const pool =
  globalWithPool.durableRunPool ??
  new Pool({ connectionString: env.DATABASE_URL })

globalWithPool.durableRunPool = pool

export const db = drizzle({ client: pool, schema })
