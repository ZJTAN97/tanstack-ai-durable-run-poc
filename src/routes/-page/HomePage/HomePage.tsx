import { Container, Stack, Text, Title } from '@mantine/core'
import { getRouteApi } from '@tanstack/react-router'

import { ThreadIdentity } from './ThreadIdentity/ThreadIdentity'

// Read through the route api rather than importing the route: the route already
// imports this component, and importing it back would close the cycle.
const homeRoute = getRouteApi('/')

export function HomePage() {
  const { threadId } = homeRoute.useSearch()

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={1}>TanStack AI durable run POC</Title>
          <Text c="dimmed">
            An AI run should outlive the connection that started it. This page
            carries the conversation's identity in its URL, so a reload lands
            back in the same conversation instead of starting a new one.
          </Text>
        </Stack>

        <ThreadIdentity threadId={threadId} />
      </Stack>
    </Container>
  )
}
