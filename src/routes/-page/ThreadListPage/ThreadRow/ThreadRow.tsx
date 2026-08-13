import { ActionIcon, Group, Paper, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { ThreadSummary } from '@/schema/thread'

import { formatRelativeTime } from '../format-relative-time'
import classes from './ThreadRow.module.css'
import { TrashIcon } from './TrashIcon'

export function ThreadRow({
  thread,
  onRequestDeletion,
}: {
  thread: ThreadSummary
  onRequestDeletion: () => void
}) {
  const displayTitle = thread.title ?? 'Untitled conversation'

  return (
    <Paper className={classes.root} withBorder radius="md" px="md" py="sm">
      <Group gap="xs" wrap="nowrap">
        <Link
          to="/threads/$threadId"
          params={{ threadId: thread.threadId }}
          className={classes.openLink}
        >
          <Text fw={500} lineClamp={1}>
            {displayTitle}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
              {thread.threadId}
            </Text>
            {/* The server renders this in its timezone and its "now", and the
                browser would disagree on both. The text is a rough age, so the
                disagreement is cosmetic — worth suppressing rather than worth an
                effect that re-renders every row on mount. */}
            <Text size="xs" c="dimmed" suppressHydrationWarning>
              · {formatRelativeTime(thread.updatedAt)}
            </Text>
          </Group>
        </Link>

        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Delete ${displayTitle}`}
          onClick={onRequestDeletion}
        >
          <TrashIcon />
        </ActionIcon>
      </Group>
    </Paper>
  )
}
