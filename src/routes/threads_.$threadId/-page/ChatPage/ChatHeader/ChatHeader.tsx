import { Anchor, Button, Group } from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'

import { createThreadId } from '@/lib/create-thread-id'

import classes from './ChatHeader.module.css'

export function ChatHeader() {
  const navigate = useNavigate()

  // A navigation, not local state — the URL is where the conversation's identity
  // has to live for the next reload to find it.
  function startNewChat() {
    navigate({
      to: '/threads/$threadId',
      params: { threadId: createThreadId() },
    })
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
      {/* renderRoot rather than `component={Link}`: Mantine's polymorphic prop
          widens the link's props and loses the router's typed knowledge of the
          route being linked to. */}
      <Anchor
        fw={600}
        c="inherit"
        underline="never"
        renderRoot={(anchorProps) => <Link to="/" {...anchorProps} />}
      >
        ← Durable Chat
      </Anchor>
      <Button variant="default" size="xs" onClick={startNewChat}>
        New chat
      </Button>
    </Group>
  )
}
