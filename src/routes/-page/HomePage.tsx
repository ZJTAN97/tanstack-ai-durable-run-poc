import { Container, Stack, Text, Title } from '@mantine/core'

export function HomePage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>TanStack AI durable run POC</Title>
        <Text c="dimmed">
          The document shell renders through Mantine on the server, so the
          colour scheme is already correct on the first paint.
        </Text>
      </Stack>
    </Container>
  )
}
