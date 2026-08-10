import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
} from '@tanstack/ai-react'

// Module-level, because `useChat` reads the transport once — the connection it
// is constructed with is the one it keeps. Rebuilding it per render would be
// pure waste; only the thread id below actually varies.
const durableChatConnection = fetchServerSentEvents('/api/chat')

/**
 * The chat client's configuration for one conversation.
 *
 * `persistence: true` is server-authoritative: the browser caches nothing, and
 * on mount the client asks the endpoint for this thread — `GET ?threadId=`,
 * which `fetchServerSentEvents` issues itself — and gets back the stored
 * transcript plus a cursor to a run still generating, which it then tails.
 *
 * That is a stronger claim than the `localStorage` record this replaced, not
 * just a tidier one. A cached blob makes a reload resumable in *that browser*;
 * the run pointer resolved from Postgres makes it resumable anywhere the URL
 * goes, because the question "is a run still going on this thread?" is now
 * answered by the server that is running it. The whole reason the transcript
 * moved into Postgres was to be read back, and this is the read.
 *
 * `threadId` is the wire identity and the hydration key both, which is what
 * makes the URL from ticket 05 the thing a reload rejoins by: same URL, same
 * thread, same in-flight run.
 */
export function createChatOptions(threadId: string) {
  return createChatClientOptions({
    connection: durableChatConnection,
    persistence: true,
    threadId,
  })
}

export type ConversationMessage = InferChatMessages<
  ReturnType<typeof createChatOptions>
>[number]

export type ConversationMessagePart = ConversationMessage['parts'][number]
