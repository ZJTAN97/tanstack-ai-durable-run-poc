import { createFileRoute } from '@tanstack/react-router'

import { listThreads } from './-page/ThreadListPage/list-threads'
import { ThreadListPage } from './-page/ThreadListPage/ThreadListPage'

export const Route = createFileRoute('/')({
  loader: () => listThreads(),
  component: ThreadListPage,
})
