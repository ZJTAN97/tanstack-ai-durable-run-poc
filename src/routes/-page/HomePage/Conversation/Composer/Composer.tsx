import { Button, Group, Stack, Textarea } from '@mantine/core'
import { useState } from 'react'

/**
 * The message box.
 *
 * Sends go through the parent's `onSend` and nowhere else — no effect watches
 * the draft and decides to submit it. A send is a thing the user did, so it
 * belongs in the handler for the thing they did.
 */
export function Composer({
  onSend,
  isBusy,
  onStop,
}: {
  onSend: (content: string) => void
  isBusy: boolean
  onStop: () => void
}) {
  const [draft, setDraft] = useState('')

  const trimmedDraft = draft.trim()
  const canSend = trimmedDraft.length > 0 && !isBusy

  function submitDraft() {
    if (!canSend) {
      return
    }

    onSend(trimmedDraft)
    setDraft('')
  }

  return (
    <Stack gap="xs">
      <Textarea
        label="Message"
        placeholder="Ask something…"
        autosize
        minRows={2}
        maxRows={6}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          const isPlainEnter = event.key === 'Enter' && !event.shiftKey

          if (isPlainEnter) {
            event.preventDefault()
            submitDraft()
          }
        }}
      />
      <Group justify="flex-end" gap="sm">
        {isBusy && (
          <Button variant="default" onClick={onStop}>
            Stop
          </Button>
        )}
        <Button onClick={submitDraft} disabled={!canSend}>
          Send
        </Button>
      </Group>
    </Stack>
  )
}
