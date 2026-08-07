import { Alert, Anchor, Code, Container, Stack, Text } from '@mantine/core'
import {
  ErrorComponent,
  type ErrorComponentProps,
  Link,
  SearchParamError,
} from '@tanstack/react-router'

import { DEFAULT_THREAD_ID } from '@/schema/thread'

/**
 * What a URL naming an unaddressable conversation renders instead of the page.
 *
 * The offer is a link to the default conversation rather than a silent
 * redirect: the address bar keeps the id that was rejected, so it can be read
 * and corrected.
 */
export function InvalidThreadNotice({ error }: ErrorComponentProps) {
  const isMalformedThreadId = error instanceof SearchParamError

  // Every other failure on this route reaches here too, and blaming the thread
  // id for one would send the reader off to fix a URL that was never wrong.
  if (!isMalformedThreadId) {
    return <ErrorComponent error={error} />
  }

  return (
    <Container size="sm" py="xl">
      <Alert color="red" title="This URL does not name a usable conversation">
        <Stack gap="sm">
          <Text size="sm">
            A thread id may contain only letters, digits, <Code>-</Code> and{' '}
            <Code>_</Code>, and must be no longer than 64 characters. Leave{' '}
            <Code>?threadId=</Code> off entirely to use the default
            conversation.
          </Text>
          <Text size="sm">
            {/* renderRoot rather than `component={Link}`: Mantine's polymorphic
                prop widens the link's props and loses the router's typed
                knowledge of this route's search params. */}
            <Anchor
              renderRoot={(anchorProps) => (
                <Link
                  to="/"
                  search={{ threadId: DEFAULT_THREAD_ID }}
                  {...anchorProps}
                />
              )}
            >
              Go to the default conversation
            </Anchor>
          </Text>
        </Stack>
      </Alert>
    </Container>
  )
}
