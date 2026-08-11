// biome-ignore-all lint/suspicious/noArrayIndexKey: a message's parts carry no id of their own, and a streaming message only ever appends to that list — nothing is inserted or reordered, so a part's index is stable for its lifetime.

import { Paper, Stack, VisuallyHidden } from '@mantine/core'

import type { ConversationMessage } from '../../create-chat-options'
import classes from './MessageBubble.module.css'
import { MessagePartView } from './MessagePartView/MessagePartView'

const ROLE_LABELS = {
  user: 'You said',
  assistant: 'Assistant said',
  system: 'System said',
}

/**
 * One turn, shaped by who is speaking.
 *
 * The two roles are different objects rather than one object tinted two ways: a
 * short question reads well in a bubble, and a long answer does not — it wants
 * the full column width. Alignment and tint carry the role visually, so the
 * caption that used to say it is now only announced to assistive technology.
 */
export function MessageBubble({ message }: { message: ConversationMessage }) {
  const parts = (
    <Stack gap="sm">
      <VisuallyHidden>{ROLE_LABELS[message.role]}:</VisuallyHidden>
      {message.parts.map((part, partIndex) => (
        <MessagePartView key={partIndex} part={part} role={message.role} />
      ))}
    </Stack>
  )

  if (message.role === 'user') {
    return (
      <div className={classes.userRow}>
        <Paper className={classes.userBubble} radius="lg" px="md" py="sm">
          {parts}
        </Paper>
      </div>
    )
  }

  return <div className={classes.assistantTurn}>{parts}</div>
}
