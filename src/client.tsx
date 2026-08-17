import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { openLocalDatabase } from '@/lib/powersync/database'

/**
 * A custom client entry, replacing the framework's default, for one reason: the
 * local database has to be open before any route renders, and this is the only
 * place in the app that is browser-only by construction.
 *
 * The root route's loader would be the obvious home, but SPA mode prerenders the
 * shell with the SSR build and runs root loaders while doing it — there is no
 * browser there to open SQLite in. Putting it here needs no `typeof window`
 * check anywhere.
 *
 * This awaits local storage only. Replication starts inside and keeps running
 * after; blocking the first paint on the network is what an offline-tolerant app
 * must not do.
 */
await openLocalDatabase()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
