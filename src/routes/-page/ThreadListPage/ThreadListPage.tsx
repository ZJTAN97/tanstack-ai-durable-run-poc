import { Button, Container, Group, Paper, Stack, Text } from '@mantine/core'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'

import { createThreadId } from '@/lib/create-thread-id'

import { formatRelativeTime } from './format-relative-time'
import classes from './ThreadListPage.module.css'

// Read through the route api rather than importing the route: the route already
// imports this component, and importing it back would close the cycle.
const threadListRoute = getRouteApi('/')

/**
 * Every conversation the server is holding, as a way in to each one.
 *
 * This is the home route because it is the honest answer to what this app has:
 * the transcripts live in Postgres, not in a browser, so they can be listed at
 * all — and a thread opened from here is the same thread on any device, which is
 * the durability claim stated as a piece of navigation rather than a paragraph.
 */
export function ThreadListPage() {
  const threads = threadListRoute.useLoaderData()
  const navigate = useNavigate()

  // A navigation, not local state — the URL is where the conversation's identity
  // has to live for the next reload to find it. Nothing is written here: the
  // thread row appears once the first turn is saved.
  function startNewChat() {
    navigate({
      to: '/threads/$threadId',
      params: { threadId: createThreadId() },
    })
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" wrap="nowrap">
          <Text component="h1" fw={600} fz="xl">
            Durable Chat
          </Text>
          <Button onClick={startNewChat}>New chat</Button>
        </Group>

        {threads.length === 0 ? (
          <Text size="sm" c="dimmed">
            No conversations yet. Start one and it will be waiting here on the
            next visit — from this browser or any other.
          </Text>
        ) : (
          <Stack gap="xs">
            {threads.map((thread) => (
              <Paper
                key={thread.threadId}
                className={classes.threadRow}
                withBorder
                radius="md"
                px="md"
                py="sm"
                renderRoot={(paperProps) => (
                  <Link
                    to="/threads/$threadId"
                    params={{ threadId: thread.threadId }}
                    {...paperProps}
                  />
                )}
              >
                <Text fw={500} lineClamp={1}>
                  {thread.title ?? 'Untitled conversation'}
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                    {thread.threadId}
                  </Text>
                  {/* The server renders this in its timezone and its "now", and
                      the browser would disagree on both. The text is a rough age,
                      so the disagreement is cosmetic — worth suppressing rather
                      than worth an effect that re-renders every row on mount. */}
                  <Text size="xs" c="dimmed" suppressHydrationWarning>
                    · {formatRelativeTime(thread.updatedAt)}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}
