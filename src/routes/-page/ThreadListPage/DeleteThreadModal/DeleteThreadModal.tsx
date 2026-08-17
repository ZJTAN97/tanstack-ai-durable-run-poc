import { Button, Group, Modal, Stack, Text } from '@mantine/core'

import type { ThreadListRow } from '../hooks/use-thread-list'

/**
 * The confirmation step for a delete that cannot be undone.
 *
 * One modal owned by the list rather than one per row: the thread being deleted
 * is what varies, and rendering a dialog per row would mean as many dialogs as
 * conversations for a thing only ever open once.
 */
export function DeleteThreadModal({
  thread,
  isDeleting,
  failureReason,
  onCancel,
  onConfirm,
}: {
  thread: ThreadListRow | null
  isDeleting: boolean
  failureReason: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      opened={thread !== null}
      onClose={onCancel}
      title="Delete this chat?"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          <Text span fw={500}>
            {thread?.title ?? 'Untitled'}
          </Text>{' '}
          and everything the server holds for it — the transcript and its run
          history — will be removed. This cannot be undone.
        </Text>

        {failureReason !== null && (
          <Text size="sm" c="red">
            {failureReason}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm} loading={isDeleting}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
