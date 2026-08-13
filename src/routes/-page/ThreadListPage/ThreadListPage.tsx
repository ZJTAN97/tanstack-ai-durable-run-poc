import { Button, Container, Group, Stack, Text } from '@mantine/core'
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { createThreadId } from '@/lib/create-thread-id'
import type { ThreadSummary } from '@/schema/thread'
import { DeleteThreadModal } from './DeleteThreadModal/DeleteThreadModal'
import { deleteThread } from './delete-thread'
import { ThreadRow } from './ThreadRow/ThreadRow'

// Read through the route api rather than importing the route: the route already
// imports this component, and importing it back would close the cycle.
const threadListRoute = getRouteApi('/')

/**
 * Every conversation the server is holding, as a way in to each one.
 *
 * This is the home route because it is the honest answer to what this app has:
 * the transcripts live in Postgres, not in a browser, so they can be listed at
 * all — and a thread opened from here is the same thread on any device, which is
 * the durability claim stated as a piece of navigation rather than a paragraph.
 */
export function ThreadListPage() {
  const threads = threadListRoute.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [threadPendingDeletion, setThreadPendingDeletion] =
    useState<ThreadSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [failureReason, setFailureReason] = useState<string | null>(null)

  // A navigation, not local state — the URL is where the conversation's identity
  // has to live for the next reload to find it. Nothing is written here: the
  // thread row appears once the first turn is saved.
  function startNewChat() {
    navigate({
      to: '/threads/$threadId',
      params: { threadId: createThreadId() },
    })
  }

  function cancelDeletion() {
    setThreadPendingDeletion(null)
    setFailureReason(null)
  }

  // The list comes from the loader, so the loader is what has to be told the row
  // is gone — invalidating refetches it from the server rather than editing a
  // local copy that the server has not confirmed.
  async function confirmDeletion() {
    if (threadPendingDeletion === null) {
      return
    }

    setIsDeleting(true)
    setFailureReason(null)

    try {
      await deleteThread({
        data: { threadId: threadPendingDeletion.threadId },
      })
      await router.invalidate()
      setThreadPendingDeletion(null)
    } catch (error) {
      setFailureReason(
        error instanceof Error
          ? `Could not delete this chat: ${error.message}`
          : 'Could not delete this chat.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" wrap="nowrap">
          <Text component="h1" fw={600} fz="xl">
            Durable Chat
          </Text>
          <Button onClick={startNewChat}>New chat</Button>
        </Group>

        {threads.length === 0 ? (
          <Text size="sm" c="dimmed">
            No conversations yet. Start one and it will be waiting here on the
            next visit — from this browser or any other.
          </Text>
        ) : (
          <Stack gap="xs">
            {threads.map((thread) => (
              <ThreadRow
                key={thread.threadId}
                thread={thread}
                onRequestDeletion={() => setThreadPendingDeletion(thread)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <DeleteThreadModal
        thread={threadPendingDeletion}
        isDeleting={isDeleting}
        failureReason={failureReason}
        onCancel={cancelDeletion}
        onConfirm={confirmDeletion}
      />
    </Container>
  )
}
