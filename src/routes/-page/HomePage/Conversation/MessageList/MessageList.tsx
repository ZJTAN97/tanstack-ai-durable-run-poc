import { Center, Stack, Text } from '@mantine/core'

import type { ConversationMessage } from '../create-chat-options'

import { MessageBubble } from './MessageBubble/MessageBubble'

export function MessageList({
  messages,
}: {
  messages: Array<ConversationMessage>
}) {
  if (messages.length === 0) {
    return (
      <Center mih={120}>
        <Text size="sm" c="dimmed" ta="center">
          Nothing in this conversation yet. Send a message, or start the long
          run above and reload the page while it is still writing.
        </Text>
      </Center>
    )
  }

  return (
    <Stack gap="sm">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </Stack>
  )
}
