import { Button, Card, Group, Stack, Text } from '@mantine/core'

import { LONG_RUN_PRESET_PROMPT } from './long-run-prompt'

/**
 * One click, one reliably slow run — the instrument the durability test needs.
 *
 * The reload has to land while the reply is still arriving, so the window to
 * reload in must be wide and the same on every attempt. This button buys that;
 * a hand-typed question does not.
 */
export function LongRunPreset({
  onStart,
  isBusy,
}: {
  onStart: (prompt: string) => void
  isBusy: boolean
}) {
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Text size="sm" fw={600}>
            Durability test
          </Text>
          <Button
            variant="light"
            size="xs"
            flex="0 0 auto"
            disabled={isBusy}
            onClick={() => onStart(LONG_RUN_PRESET_PROMPT)}
          >
            Start a long run
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Start the long run, wait for text to appear, then reload the page
          while it is still writing. The reply should carry on from where it
          was, under the same run id — not start again, and not stop short.
        </Text>
      </Stack>
    </Card>
  )
}
