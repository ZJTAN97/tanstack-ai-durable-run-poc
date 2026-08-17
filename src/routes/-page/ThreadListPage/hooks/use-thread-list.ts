import { eq, Query, useLiveQuery } from '@tanstack/react-db'

import { runCollection, threadCollection } from '@/lib/powersync/collections'

// A join condition must be a single equality, so "is this run generating" cannot
// ride along in the `on` clause — it narrows the runs first and the join matches
// against what is left.
const generatingRuns = new Query()
  .from({ run: runCollection })
  .where(({ run }) => eq(run.status, 'running'))

/**
 * Every thread this device has synced, newest first, each knowing whether a run
 * is generating in it right now.
 *
 * A join rather than two queries stitched together in the component: the badge
 * is a fact about a thread that only the run rows hold, and joining is the thing
 * TanStack DB adds on top of PowerSync that a plain `db.watch()` would not.
 *
 * More than one *running* run in a thread would duplicate its row. The server
 * only ever has one, and treating that as an invariant here is cheaper than a
 * group-by that would hide it if it ever broke.
 */
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
