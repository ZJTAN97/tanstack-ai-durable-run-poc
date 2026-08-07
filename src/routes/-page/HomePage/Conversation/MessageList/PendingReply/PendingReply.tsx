import { Group, Loader, VisuallyHidden } from '@mantine/core'

/**
 * Stands in for a reply that has been asked for but has not produced a character
 * yet, so that sending a message visibly does something.
 */
export function PendingReply() {
  return (
    <Group gap="xs">
      <VisuallyHidden>Assistant is replying</VisuallyHidden>
      <Loader type="dots" size="sm" color="gray" />
    </Group>
  )
}
