import { Badge, Group, Text } from '@mantine/core'

import type { ConversationStatus } from '../create-chat-options'

const STATUS_COLORS: Record<ConversationStatus, string> = {
  ready: 'gray',
  submitted: 'yellow',
  streaming: 'green',
  error: 'red',
}

/**
 * The run this page currently has in flight, made visible.
 *
 * The demo's whole claim is that the run id shown before a mid-stream reload is
 * the run id shown after it. Without the id on screen, a reply that resumes and
 * a reply that quietly restarts look identical.
 */
export function RunStatus({
  status,
  runId,
}: {
  status: ConversationStatus
  runId: string | null
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge size="sm" variant="light" color={STATUS_COLORS[status]}>
        {status}
      </Badge>
      <Text size="xs" c="dimmed" ff="monospace" truncate>
        {runId === null ? 'no run in flight' : runId}
      </Text>
    </Group>
  )
}
