import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'

/** An empty name is not a name — it clears the title back to untitled. */
export function RenameForm({
  initialTitle,
  failureReason,
  onCancel,
  onConfirm,
}: {
  initialTitle: string | null
  failureReason: string | null
  onCancel: () => void
  onConfirm: (title: string | null) => void
}) {
  const [draftTitle, setDraftTitle] = useState(initialTitle ?? '')
  const trimmedTitle = draftTitle.trim()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onConfirm(trimmedTitle === '' ? null : trimmedTitle)
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Untitled"
          maxLength={200}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.currentTarget.value)}
          data-autofocus
        />

        {failureReason !== null && (
          <Text size="sm" c="red">
            {failureReason}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </form>
  )
}
