import { Button, Group, Text } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'

import classes from './ChatHeader.module.css'
import { createThreadId } from './create-thread-id'

export function ChatHeader() {
  const navigate = useNavigate()

  // A navigation, not local state — the URL is where the conversation's identity
  // has to live for the next reload to find it.
  function startNewChat() {
    navigate({ to: '/', search: { threadId: createThreadId() } })
  }

  return (
    <Group
      component="header"
      className={classes.root}
      justify="space-between"
      wrap="nowrap"
      px="md"
      py="sm"
    >
      <Text fw={600}>Durable Chat</Text>
      <Button variant="default" size="xs" onClick={startNewChat}>
        New chat
      </Button>
    </Group>
  )
}
