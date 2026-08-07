// biome-ignore-all lint/suspicious/noArrayIndexKey: a message's parts carry no id of their own, and a streaming message only ever appends to that list — nothing is inserted or reordered, so a part's index is stable for its lifetime.

import { Paper, Stack, Text } from '@mantine/core'

import type { ConversationMessage } from '../../create-chat-options'
import classes from './MessageBubble.module.css'
import { MessagePartView } from './MessagePartView/MessagePartView'

const ROLE_LABELS = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
}

export function MessageBubble({ message }: { message: ConversationMessage }) {
  const isFromUser = message.role === 'user'

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className={isFromUser ? classes.fromUser : classes.fromAssistant}
    >
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed">
          {ROLE_LABELS[message.role]}
        </Text>
        {message.parts.map((part, partIndex) => (
          <MessagePartView key={partIndex} part={part} />
        ))}
      </Stack>
    </Paper>
  )
}
