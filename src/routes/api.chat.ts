import {
  chat,
  chatParamsFromRequest,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { webSearchTool } from '@tanstack/ai-openrouter/tools'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { resumeRunRequestSchema } from '@/schema/chat'
import { chatPersistence } from '@/server/ai/chat-persistence'
import { resolveResumeOffset } from '@/server/ai/resume-position'
import { streamStore, sweepExpiredRunLogs } from '@/server/ai/stream-store'
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

        // Expiring old logs rides along with starting a new run, because a POST
        // is the only moment this server is reliably awake and about to grow the
        // log anyway. Not awaited: housekeeping must never delay a reply, and
        // never fail one — a swallowed sweep costs disk, a thrown one costs the
        // user their answer. Not a timer either, since Vite re-executes this
        // module on every save and would leak one per edit.
        void sweepExpiredRunLogs().catch((failure) => {
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

      // Two read-only requests share this verb, told apart by what they name. A
      // hydration names a *thread* (`?threadId=`) and is answered with JSON: the
      // stored transcript, plus a cursor to a run still generating. A resume
      // names a *run* — `?offset=-1&runId=…` for a rejoin, or a `Last-Event-ID`
      // header carrying the last offset delivered for a native SSE reconnect —
      // and is answered with the replayed stream. Neither is a special case of
      // the other: different question, different content type.
      GET: ({ request }) => {
        const isThreadHydration = new URL(request.url).searchParams.has(
          'threadId',
        )

        // No `authorize` callback, because this POC has no sessions: every
        // visitor is the same visitor and a thread id is a bookmark, not a
        // secret. Anything with real users must pass one — the helper will
        // otherwise hand the full transcript to whoever guesses a `?threadId=`.
        if (isThreadHydration) {
          return reconstructChat(chatPersistence, request)
        }

        const parsedResume = resumeRunRequestSchema.safeParse({
          runId: resolveResumeRunId(request),
          offset: resolveResumeOffset(request),
        })

        if (!parsedResume.success) {
          return badRequest(z.prettifyError(parsedResume.error))
        }

        // The offset's format belongs to the log, not to this route, so the
        // only place it can be judged is where the store reads it. A position
        // the store refuses to accept is a bad request, not a server fault —
        // catching it here keeps that legible without naming a backend.
        try {
          return resumeServerSentEventsResponse({
            adapter: streamStore(request),
          })
        } catch (rejection) {
          return badRequest(
            rejection instanceof Error ? rejection.message : String(rejection),
          )
        }
      },
    },
  },
})
