import { Badge, Text } from '@mantine/core'

import type { ConversationMessagePart } from '../../../create-chat-options'

import classes from './MessagePartView.module.css'
import { ThoughtProcess } from './ThoughtProcess/ThoughtProcess'
import { ToolActivity } from './ToolActivity/ToolActivity'

/**
 * One part of a message, rendered according to what it actually is.
 *
 * A message is a list of parts, not a string — an assistant turn can carry
 * reasoning and tool calls beside its prose. Reading `parts[0].content` and
 * calling it the message works right up until the model thinks first, and then
 * renders a blank reply.
 *
 * Every branch here is reachable in principle, and the default branch exists so
 * that a part type this POC has never seen degrades to a label instead of
 * taking the page down mid-stream.
 */
export function MessagePartView({ part }: { part: ConversationMessagePart }) {
  switch (part.type) {
    case 'text':
      return <Text className={classes.body}>{part.content}</Text>

    case 'thinking':
      return <ThoughtProcess reasoning={part.content} />

    case 'tool-call':
      return (
        <ToolActivity
          label={`Used ${part.name}`}
          color="blue"
          payload={part.arguments}
        />
      )

    case 'tool-result':
      return (
        <ToolActivity
          label={part.error === undefined ? 'Tool result' : 'Tool failed'}
          color={part.error === undefined ? 'teal' : 'red'}
          payload={
            typeof part.content === 'string'
              ? part.content
              : JSON.stringify(part.content, null, 2)
          }
        />
      )

    default:
      return (
        <Badge size="xs" variant="light" color="gray">
          unrendered part — {part.type}
        </Badge>
      )
  }
}
