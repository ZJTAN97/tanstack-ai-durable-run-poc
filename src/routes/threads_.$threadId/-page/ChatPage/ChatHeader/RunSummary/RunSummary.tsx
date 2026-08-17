import { Badge, Group, Text } from '@mantine/core'
import type { RunStatus } from '@tanstack/ai'
import { eq, useLiveQuery } from '@tanstack/react-db'

import { runCollection } from '@/lib/powersync/collections'

const STATUS_COLOURS: Record<RunStatus, string> = {
  running: 'blue',
  interrupted: 'yellow',
  completed: 'teal',
  failed: 'red',
  aborted: 'gray',
}

/**
 * How this thread's most recent run ended, and what it cost.
 *
 * The sharper half of the demonstration. `usage` is written once, when the run
 * finishes — so a device that never attached to that run's stream can learn it
 * *only* through Sync. Nothing here reads the stream or polls the server.
 */
export function RunSummary({ threadId }: { threadId: string }) {
  const { data: runs } = useLiveQuery(
    (q) =>
      q
        .from({ run: runCollection })
        .where(({ run }) => eq(run.thread_id, threadId))
        .orderBy(({ run }) => run.started_at, 'desc')
        .limit(1),
    [threadId],
  )

  const latestRun = runs[0]
  if (latestRun === undefined) return null

  return (
    <Group gap="xs" wrap="nowrap">
      <Badge color={STATUS_COLOURS[latestRun.status]} variant="light" size="sm">
        {latestRun.status}
      </Badge>

      {latestRun.error !== null && (
        <Text size="xs" c="red" lineClamp={1} maw={240}>
          {latestRun.error}
        </Text>
      )}

      {latestRun.usage !== null && (
        <Text size="xs" c="dimmed">
          {latestRun.usage.totalTokens.toLocaleString()} tokens
        </Text>
      )}
    </Group>
  )
}
