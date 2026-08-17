import { Anchor, Button, Group } from '@mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { createThreadId } from '@/lib/create-thread-id'
import { threadCollection } from '@/lib/powersync/collections'

import classes from './ChatHeader.module.css'
import { RunSummary } from './RunSummary/RunSummary'

export function ChatHeader({ threadId }: { threadId: string }) {
  const navigate = useNavigate()

  // A navigation, not local state — the URL is where the conversation's identity
  // has to live for the next reload to find it. The row is written first so the
  // thread exists from the moment it is created, empty or not.
  function startNewChat() {
    const newThreadId = createThreadId()
    threadCollection.insert({ id: newThreadId, title: null, updated_at: null })
    navigate({
      to: '/threads/$threadId',
      params: { threadId: newThreadId },
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
      <Group gap="sm" wrap="nowrap">
        <RunSummary threadId={threadId} />
        <Button variant="default" size="xs" onClick={startNewChat}>
          New chat
        </Button>
      </Group>
    </Group>
  )
}
