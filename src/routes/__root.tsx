import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from '@mantine/core'
import '@mantine/core/styles.layer.css'
import { PowerSyncContext } from '@powersync/react'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'

import { SyncStatusIndicator } from '@/components/SyncStatusIndicator/SyncStatusIndicator'
import { powerSyncDatabase } from '@/lib/powersync/database'
import { theme } from '@/theme'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack AI durable run POC',
      },
    ],
  }),
  // No loader opening the database. Root loaders run during SPA shell
  // prerendering, which happens in the SSR build with no browser to open SQLite
  // in — so that lives in src/client.tsx instead.
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          {/* Only `useStatus` reads this — the collections hold their own
              reference to the database and do not resolve it from context. */}
          <PowerSyncContext.Provider value={powerSyncDatabase}>
            {children}
            <SyncStatusIndicator />
          </PowerSyncContext.Provider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
