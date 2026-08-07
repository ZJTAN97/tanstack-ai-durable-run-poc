import { Button, Card, Group, Stack, Text } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'

import { createThreadId } from './create-thread-id'

/**
 * The conversation's identity, made visible.
 *
 * On screen because the durability demo turns on it: if the thread id shown
 * after a reload is not the one shown before, nothing that follows can be
 * evidence of a resumed conversation.
 */
export function ThreadIdentity({ threadId }: { threadId: string }) {
  const navigate = useNavigate()

  // A navigation, not local state — the URL is where this value has to live for
  // the next reload to find it.
  function startCleanConversation() {
    navigate({ to: '/', search: { threadId: createThreadId() } })
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Thread id
        </Text>
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Text ff="monospace" size="sm" truncate>
            {threadId}
          </Text>
          <Button
            variant="light"
            size="xs"
            flex="0 0 auto"
            onClick={startCleanConversation}
          >
            New conversation
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Edit{' '}
          <Text span ff="monospace">
            ?threadId=
          </Text>{' '}
          in the address bar to address a different conversation. Reloading
          keeps the one you are in.
        </Text>
      </Stack>
    </Card>
  )
}
