import { createFileRoute } from '@tanstack/react-router'

import { ChatPage } from './-page/ChatPage/ChatPage'

/**
 * No loader. The chat client hydrates itself — `useChat` asks `/api/chat` for
 * this thread's transcript and for a run still generating as it constructs — so
 * a loader here would be a second, racing reader of the same state.
 *
 * `threads_` rather than `threads` keeps this flat: there is no `/threads` index
 * to nest under, and the thread list is the home route.
 */
export const Route = createFileRoute('/threads_/$threadId')({
  component: ChatPage,
})
