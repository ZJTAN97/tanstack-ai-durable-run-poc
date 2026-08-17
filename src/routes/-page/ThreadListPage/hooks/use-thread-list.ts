import { eq, Query, useLiveQuery } from '@tanstack/react-db'

import { runCollection, threadCollection } from '@/lib/powersync/collections'

const generatingRuns = new Query()
  .from({ run: runCollection })
  .where(({ run }) => eq(run.status, 'running'))

export function useThreadList() {
  return useLiveQuery((q) =>
    q
      .from({ thread: threadCollection })
      .leftJoin({ generating: generatingRuns }, ({ thread, generating }) =>
        eq(generating.thread_id, thread.id),
      )
      .orderBy(({ thread }) => thread.updated_at, 'desc')
      .select(({ thread, generating }) => ({
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updated_at,
        generatingRunId: generating.id,
      })),
  )
}

export type ThreadListRow = ReturnType<typeof useThreadList>['data'][number]
