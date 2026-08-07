import { Alert, Card, Divider, Stack } from '@mantine/core'
import { useChat } from '@tanstack/ai-react'

import { Composer } from './Composer/Composer'
import { createChatOptions } from './create-chat-options'
import { LongRunPreset } from './LongRunPreset/LongRunPreset'
import { MessageList } from './MessageList/MessageList'
import { RunStatus } from './RunStatus/RunStatus'

/**
 * The conversation, and the two things that make it survive a reload.
 *
 * Delivery durability (ticket 04) keeps the run going server-side and keeps a
 * log of it that can be replayed. Browser persistence keeps the transcript and
 * — the part that matters — the pointer to a run still in flight. Either alone
 * fails the test: durability without the pointer gives a resumable log that the
 * reloaded page has forgotten the name of, and persistence without durability
 * repaints a transcript whose last reply can never finish.
 *
 * There is no effect here rejoining the run, deliberately. `useChat` already
 * reads the persisted pointer as it constructs its client and re-attaches to
 * the log itself. A hand-wired stream would be a second consumer of the same
 * run, racing the one that already exists.
 */
export function Conversation({ threadId }: { threadId: string }) {
  const { messages, sendMessage, stop, isLoading, status, runId, error } =
    useChat(createChatOptions(threadId))

  return (
    <Stack gap="md">
      <LongRunPreset onStart={sendMessage} isBusy={isLoading} />

      {error !== undefined && (
        <Alert color="red" title="The run failed">
          {error.message}
        </Alert>
      )}

      <Card withBorder radius="md" padding="md">
        <Stack gap="md">
          <RunStatus status={status} runId={runId} />
          <Divider />
          <MessageList messages={messages} />
          <Divider />
          <Composer onSend={sendMessage} isBusy={isLoading} onStop={stop} />
        </Stack>
      </Card>
    </Stack>
  )
}
