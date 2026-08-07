import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
  localStoragePersistence,
  type UseChatReturn,
} from '@tanstack/ai-react'

// Module-level, because `useChat` reads the transport once — the connection it
// is constructed with is the one it keeps. Rebuilding it per render would be
// pure waste; only the thread id below actually varies.
const durableChatConnection = fetchServerSentEvents('/api/chat')

/**
 * Where the browser keeps the conversation between page loads.
 *
 * The stored record is one blob per thread holding both the transcript *and*
 * the pointer to a run still in flight. Both halves are load-bearing and
 * neither is sufficient alone: without the pointer a reload repaints a
 * conversation whose last reply is frozen half-written, and without the
 * transcript there is nothing to paint the resumed reply onto.
 *
 * `localStorage` reads throw during SSR, which the persistence layer treats as
 * best-effort — the server renders an empty transcript and the browser fills it
 * in on mount.
 */
const browserPersistence = localStoragePersistence({
  keyPrefix: 'durable-run-poc:',
})

/**
 * The chat client's configuration for one conversation.
 *
 * `threadId` is both the wire identity and the browser storage key, which is
 * what makes the URL from ticket 05 the thing a reload rejoins by: same URL,
 * same key, same conversation, same in-flight run.
 */
export function createChatOptions(threadId: string) {
  return createChatClientOptions({
    connection: durableChatConnection,
    persistence: browserPersistence,
    threadId,
  })
}

export type ConversationMessage = InferChatMessages<
  ReturnType<typeof createChatOptions>
>[number]

export type ConversationMessagePart = ConversationMessage['parts'][number]

/**
 * Read off the hook's own return rather than imported from `@tanstack/ai-client`
 * — that package is a transitive dependency of `@tanstack/ai-react`, and naming
 * it directly would take a dependency this project never declared.
 */
export type ConversationStatus = UseChatReturn['status']
