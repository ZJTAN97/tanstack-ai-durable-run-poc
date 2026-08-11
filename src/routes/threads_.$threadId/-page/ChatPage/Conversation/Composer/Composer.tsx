import { ActionIcon, Group, Paper, Text, Textarea } from '@mantine/core'
import { useCallback, useState } from 'react'

import classes from './Composer.module.css'
import { SendIcon } from './SendIcon'
import { StopIcon } from './StopIcon'

/**
 * The message box, pinned to the bottom of the viewport.
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

  // A ref callback rather than an effect, because focusing an input on mount is
  // touching the DOM, not synchronising state. Memoised because React re-invokes
  // a ref callback whose identity changed, and an inline one would steal focus
  // back on every keystroke. A new chat remounts this via the thread key, which
  // is what puts the cursor in the box after starting one.
  const focusOnMount = useCallback((input: HTMLTextAreaElement | null) => {
    input?.focus()
  }, [])

  function submitDraft() {
    if (!canSend) {
      return
    }

    onSend(trimmedDraft)
    setDraft('')
  }

  return (
    <div className={classes.root}>
      <div className={classes.column}>
        <Paper className={classes.surface} withBorder radius="lg" p="xs">
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Textarea
              ref={focusOnMount}
              variant="unstyled"
              flex={1}
              autosize
              minRows={1}
              maxRows={8}
              aria-label="Message"
              placeholder="Message…"
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
            {isBusy ? (
              <ActionIcon
                size="lg"
                radius="xl"
                variant="filled"
                color="gray"
                aria-label="Stop generating"
                onClick={onStop}
              >
                <StopIcon />
              </ActionIcon>
            ) : (
              <ActionIcon
                size="lg"
                radius="xl"
                variant="filled"
                aria-label="Send message"
                disabled={!canSend}
                onClick={submitDraft}
              >
                <SendIcon />
              </ActionIcon>
            )}
          </Group>
        </Paper>
        <Text size="xs" c="dimmed" ta="center">
          Enter to send, Shift + Enter for a new line.
        </Text>
      </div>
    </div>
  )
}
