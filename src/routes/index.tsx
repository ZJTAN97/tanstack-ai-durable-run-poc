import { createFileRoute } from '@tanstack/react-router'

import { ThreadListPage } from './-page/ThreadListPage/ThreadListPage'

export const Route = createFileRoute('/')({
  component: ThreadListPage,
})
