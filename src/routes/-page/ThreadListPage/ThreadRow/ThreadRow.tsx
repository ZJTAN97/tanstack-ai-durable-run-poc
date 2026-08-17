import { ActionIcon, Badge, Group, Paper, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { formatRelativeTime } from '../format-relative-time'
import type { ThreadListRow } from '../hooks/use-thread-list'
import { PencilIcon } from './PencilIcon'
import classes from './ThreadRow.module.css'
import { TrashIcon } from './TrashIcon'

export function ThreadRow({
  thread,
  onRequestRename,
  onRequestDeletion,
}: {
  thread: ThreadListRow
  onRequestRename: () => void
  onRequestDeletion: () => void
}) {
  const displayTitle = thread.title ?? 'Untitled'
  const isGenerating = thread.generatingRunId !== undefined

  return (
    <Paper className={classes.root} withBorder radius="md" px="md" py="sm">
      <Group gap="xs" wrap="nowrap">
        <Link
          to="/threads/$threadId"
          params={{ threadId: thread.id }}
          className={classes.openLink}
        >
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} lineClamp={1}>
              {displayTitle}
            </Text>
            {/* Sync knows a run is in flight without this device ever attaching
                to its stream. That is the whole demonstration, so it is a badge
                and not a console log. */}
            {isGenerating && (
              <Badge color="blue" variant="light" size="sm">
                Generating
              </Badge>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
              {thread.id}
            </Text>
            {thread.updatedAt !== null && (
              <Text size="xs" c="dimmed">
                · {formatRelativeTime(thread.updatedAt)}
              </Text>
            )}
          </Group>
        </Link>

        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Rename ${displayTitle}`}
          onClick={onRequestRename}
        >
          <PencilIcon />
        </ActionIcon>

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
