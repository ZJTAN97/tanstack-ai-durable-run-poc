import { Alert, Stack, Text } from '@mantine/core'

/**
 * A reply that did not happen, shown where the reply would have been.
 *
 * In the transcript rather than in a banner above the page, because the reader
 * needs to know *which* turn failed, and a banner detached from the turn does
 * not tell them.
 */
export function FailedTurn({ reason }: { reason: string }) {
  return (
    <Alert color="red" variant="light" title="This reply didn't finish">
      <Stack gap="xs">
        <Text size="sm">
          Sending the message again usually works. If it keeps failing, the
          server or the model provider is likely misconfigured.
        </Text>
        <Text size="xs" c="dimmed">
          {reason}
        </Text>
      </Stack>
    </Alert>
  )
}
