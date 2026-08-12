import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
} from '@tanstack/ai-react'

const durableChatConnection = fetchServerSentEvents('/api/chat')

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
