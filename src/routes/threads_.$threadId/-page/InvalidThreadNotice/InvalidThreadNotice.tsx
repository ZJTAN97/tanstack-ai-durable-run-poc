import { Alert, Anchor, Code, Container, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

/**
 * What a URL naming an unaddressable conversation renders instead of the chat.
 *
 * The offer is a link to the thread list rather than a silent redirect: the
 * address bar keeps the id that was rejected, so it can be read and corrected.
 */
export function InvalidThreadNotice({ reason }: { reason: string }) {
  return (
    <Container size="sm" py="xl">
      <Alert color="red" title="This URL does not name a usable conversation">
        <Stack gap="sm">
          <Text size="sm">
            A thread id may contain only letters, digits, <Code>-</Code> and{' '}
            <Code>_</Code>, and must be no longer than 64 characters — this one{' '}
            {reason}.
          </Text>
          <Text size="sm">
            {/* renderRoot rather than `component={Link}`: Mantine's polymorphic
                prop widens the link's props and loses the router's typed
                knowledge of this route. */}
            <Anchor
              renderRoot={(anchorProps) => <Link to="/" {...anchorProps} />}
            >
              Back to all conversations
            </Anchor>
          </Text>
        </Stack>
      </Alert>
    </Container>
  )
}
