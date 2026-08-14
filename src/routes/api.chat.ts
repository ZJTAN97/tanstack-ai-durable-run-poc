import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { chatPersistence } from '@/server/ai/chat-persistence'
import { streamStore } from '@/server/ai/stream-store'
import { env } from '@/server/env'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, threadId, runId } =
          await chatParamsFromRequest(request)

        const stream = chat({
          adapter: createOpenRouterText(
            'qwen/qwen3.6-flash',
            env.OPENROUTER_API_KEY,
          ),
          messages,
          threadId,
          runId,
          systemPrompts: [
            'You are a helpful AI Assistant that knows your gundam-verse very very well.',
          ],
          // modelOptions: { reasoning: { effort: 'medium' } },
          // tools: [webSearchTool({ maxResults: 2 })],
          middleware: [withPersistence(chatPersistence)],
        })

        return toServerSentEventsResponse(stream, {
          durability: { adapter: streamStore(request, runId) },
        })
      },

      GET: ({ request }) => {
        const isThreadHydration = new URL(request.url).searchParams.has(
          'threadId',
        )

        if (isThreadHydration) {
          return reconstructChat(chatPersistence, request)
        }

        return resumeServerSentEventsResponse({ adapter: streamStore(request) })
      },
    },
  },
})
