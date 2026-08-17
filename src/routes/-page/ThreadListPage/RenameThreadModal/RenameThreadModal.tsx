import { Modal } from '@mantine/core'

import type { ThreadListRow } from '../hooks/use-thread-list'
import { RenameForm } from './RenameForm/RenameForm'

/**
 * Giving a thread its name.
 *
 * The only writer of `title` in the system: the server never derives one, and a
 * thread nobody names stays untitled. The form is mounted with the thread's id
 * as its `key` so opening a different row resets the draft, rather than an
 * effect syncing state that a remount already handles.
 */
export function RenameThreadModal({
  thread,
  failureReason,
  onCancel,
  onConfirm,
}: {
  thread: ThreadListRow | null
  failureReason: string | null
  onCancel: () => void
  onConfirm: (title: string | null) => void
}) {
  return (
    <Modal opened={thread !== null} onClose={onCancel} title="Rename" centered>
      {thread !== null && (
        <RenameForm
          key={thread.id}
          initialTitle={thread.title}
          failureReason={failureReason}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Modal>
  )
}
