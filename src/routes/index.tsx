import { createFileRoute } from '@tanstack/react-router'

import { ThreadListPage } from './-page/ThreadListPage/ThreadListPage'

/**
 * No loader. The list is a live query over the local database, which is already
 * open by the time this route renders — a loader here would be a second reader
 * of state Sync owns, and one that could only ever be more stale.
 */
export const Route = createFileRoute('/')({
  component: ThreadListPage,
})
