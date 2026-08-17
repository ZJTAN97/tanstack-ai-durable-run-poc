import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/server/env'
import { issueSyncToken } from '@/server/powersync/token'

/**
 * What a device needs to open a sync session: where to connect, and proof of who
 * it is.
 *
 * The endpoint URL travels with the token rather than as a `VITE_`-prefixed
 * build-time variable, so where sync lives stays a server fact and the client
 * has no configuration of its own to keep in step.
 */
export const Route = createFileRoute('/api/powersync-token')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          endpoint: env.POWERSYNC_URL,
          token: await issueSyncToken(),
        }),
    },
  },
})
