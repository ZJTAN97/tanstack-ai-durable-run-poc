import { Button, Container, Group, Stack, Text } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { createThreadId } from '@/lib/create-thread-id'
import { threadCollection } from '@/lib/powersync/collections'

import { DeleteThreadModal } from './DeleteThreadModal/DeleteThreadModal'
import type { ThreadListRow } from './hooks/use-thread-list'
import { useThreadList } from './hooks/use-thread-list'
import { RenameThreadModal } from './RenameThreadModal/RenameThreadModal'
import { ThreadRow } from './ThreadRow/ThreadRow'

export function ThreadListPage() {
  const { data: threads } = useThreadList()
  const navigate = useNavigate()
  const [threadPendingRename, setThreadPendingRename] =
    useState<ThreadListRow | null>(null)
  const [threadPendingDeletion, setThreadPendingDeletion] =
    useState<ThreadListRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [failureReason, setFailureReason] = useState<string | null>(null)

  function startNewChat() {
    const threadId = createThreadId()
    threadCollection.insert({ id: threadId, title: null, updated_at: null })
    navigate({ to: '/threads/$threadId', params: { threadId } })
  }

  function renameThread(title: string | null) {
    if (threadPendingRename === null) return

    try {
      threadCollection.update(threadPendingRename.id, (draft) => {
        draft.title = title
      })
      setThreadPendingRename(null)
      setFailureReason(null)
    } catch (error) {
      setFailureReason(describeFailure(error, 'Could not rename this chat.'))
    }
  }

  async function confirmDeletion() {
    if (threadPendingDeletion === null) return

    setIsDeleting(true)
    setFailureReason(null)

    try {
      await threadCollection.delete(threadPendingDeletion.id).isPersisted
        .promise
      setThreadPendingDeletion(null)
    } catch (error) {
      setFailureReason(describeFailure(error, 'Could not delete this chat.'))
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
                key={thread.id}
                thread={thread}
                onRequestRename={() => {
                  setFailureReason(null)
                  setThreadPendingRename(thread)
                }}
                onRequestDeletion={() => {
                  setFailureReason(null)
                  setThreadPendingDeletion(thread)
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <RenameThreadModal
        thread={threadPendingRename}
        failureReason={failureReason}
        onCancel={() => setThreadPendingRename(null)}
        onConfirm={renameThread}
      />

      <DeleteThreadModal
        thread={threadPendingDeletion}
        isDeleting={isDeleting}
        failureReason={failureReason}
        onCancel={() => setThreadPendingDeletion(null)}
        onConfirm={confirmDeletion}
      />
    </Container>
  )
}

function describeFailure(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback
}
