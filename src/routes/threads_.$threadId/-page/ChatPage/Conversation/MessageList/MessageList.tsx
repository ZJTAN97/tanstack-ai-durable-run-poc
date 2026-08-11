import { Stack, Text } from '@mantine/core'

import type { ConversationMessage } from '../create-chat-options'
import { FailedTurn } from './FailedTurn/FailedTurn'
import { MessageBubble } from './MessageBubble/MessageBubble'
import classes from './MessageList.module.css'
import { PendingReply } from './PendingReply/PendingReply'

/**
 * The transcript, and the only thing on the page that scrolls.
 *
 * Owning the scroll container here is what keeps the composer still: the
 * conversation growing moves this element's content, not the page.
 */
/**
 * Whether the reply being generated has produced prose yet.
 *
 * A reasoning model finishes all of its thinking before emitting a single
 * character of answer, and this app collapses reasoning behind a disclosure — so
 * without this the whole thinking phase shows one small "Thought process" label
 * and no other sign of life, and the reply reads as thinking and nothing else.
 */
function hasProducedText(message: ConversationMessage | undefined) {
  if (message === undefined || message.role !== 'assistant') {
    return false
  }

  return message.parts.some(
    (part) => part.type === 'text' && part.content.length > 0,
  )
}

export function MessageList({
  messages,
  error,
  isGenerating,
}: {
  messages: Array<ConversationMessage>
  error: Error | undefined
  isGenerating: boolean
}) {
  const hasNothingToShow = messages.length === 0 && error === undefined
  const isAwaitingText = isGenerating && !hasProducedText(messages.at(-1))

  return (
    <div className={classes.viewport}>
      <div className={classes.content}>
        {hasNothingToShow ? (
          <Stack className={classes.greeting} gap="xs" align="center">
            <Text size="xl" fw={600}>
              What can I help with?
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Type a message below to start the conversation.
            </Text>
          </Stack>
        ) : (
          <Stack className={classes.turns} gap="xl">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isAwaitingText && <PendingReply />}
            {error !== undefined && <FailedTurn reason={error.message} />}
          </Stack>
        )}
      </div>
    </div>
  )
}
