import { Badge, Code, Stack, Text } from '@mantine/core'

import type { ConversationMessagePart } from '../../../create-chat-options'

import classes from './MessagePartView.module.css'

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
      return (
        <Stack gap={4}>
          <Badge size="xs" variant="light" color="grape">
            reasoning
          </Badge>
          <Text className={classes.body} size="sm" c="dimmed" fs="italic">
            {part.content}
          </Text>
        </Stack>
      )

    case 'tool-call':
      return (
        <Stack gap={4}>
          <Badge size="xs" variant="light" color="blue">
            tool call — {part.name}
          </Badge>
          <Code block className={classes.body}>
            {part.arguments}
          </Code>
        </Stack>
      )

    case 'tool-result':
      return (
        <Stack gap={4}>
          <Badge
            size="xs"
            variant="light"
            color={part.error === undefined ? 'teal' : 'red'}
          >
            tool result
          </Badge>
          <Code block className={classes.body}>
            {typeof part.content === 'string'
              ? part.content
              : JSON.stringify(part.content, null, 2)}
          </Code>
        </Stack>
      )

    default:
      return (
        <Badge size="xs" variant="light" color="gray">
          unrendered part — {part.type}
        </Badge>
      )
  }
}
