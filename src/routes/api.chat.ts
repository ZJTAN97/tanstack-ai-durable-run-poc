import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { webSearchTool } from '@tanstack/ai-openrouter/tools'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { chatPersistence } from '@/server/ai/chat-persistence'
import { sweepExpiredDeliveryLogs } from '@/server/ai/delivery-log-retention'
import { describeResumeRejection, streamStore } from '@/server/ai/stream-store'
import { env } from '@/server/env'

function badRequest(reason: string) {
  return new Response(reason, {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, threadId, runId } =
          await chatParamsFromRequest(request)

        void sweepExpiredDeliveryLogs().catch((failure) => {
          console.error('[delivery-log] sweep failed', failure)
        })

        const stream = chat({
          adapter: createOpenRouterText(
            'qwen/qwen3.6-flash',
            env.OPENROUTER_API_KEY,
          ),
          messages,
          threadId,
          runId,
          systemPrompts: ['You are a helpful AI Assistant name bob.'],
          modelOptions: { reasoning: { effort: 'none' } },
          tools: [webSearchTool({ maxResults: 2 })],
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

        // The run and position a resume asks for are written in an offset the
        // log minted, so the log is what judges them. This route only reports
        // the verdict — a resume it refuses is a bad request, not a fault.
        const rejection = describeResumeRejection(request)

        if (rejection) return badRequest(rejection)

        return resumeServerSentEventsResponse({ adapter: streamStore(request) })
      },
    },
  },
})
