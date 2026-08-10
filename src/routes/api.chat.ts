import {
  chat,
  chatParamsFromRequestBody,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { resumeRunRequestSchema, startRunRequestSchema } from '@/schema/chat'
import { textAdapter } from '@/server/ai/adapter'
import { chatPersistence } from '@/server/ai/chat-persistence'
import { resolveResumeOffset } from '@/server/ai/resume-position'
import { streamStore, sweepExpiredRunLogs } from '@/server/ai/stream-store'
import { withThinkingPersistence } from '@/server/ai/thinking-persistence'

function badRequest(reason: string) {
  return new Response(reason, {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * The durable-run contract: POST runs the model once and logs it, GET replays
 * that log. Both handlers are load-bearing — a POST-only endpoint is not
 * durable.
 *
 * A client that drops mid-run does not cancel it. On a fresh run the producer
 * and the delivery side get separate abort controllers, so the server keeps
 * draining the model into the log with nobody listening and a client that
 * rejoins later still gets the whole reply. That is the framework's behaviour;
 * this endpoint only wires it.
 *
 * Which backend the log lives in is `streamStore`'s business. Nothing here may
 * name one.
 *
 * Conversation state is a second, separate layer: `chatPersistence` writes the
 * transcript, the run's lifecycle, and its cost as each turn completes. It
 * shares no code with the delivery log and answers a different question — what
 * was said, rather than what was streamed. The server owns that copy, and GET
 * hands it back, so the browser caches nothing.
 */
export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const parsedBody = startRunRequestSchema.safeParse(body)

        if (!parsedBody.success) {
          return badRequest(z.prettifyError(parsedBody.error))
        }

        // Expiring old logs rides along with starting a new run, because a POST
        // is the only moment this server is reliably awake and about to grow the
        // log anyway. Not awaited: housekeeping must never delay a reply, and
        // never fail one — a swallowed sweep costs disk, a thrown one costs the
        // user their answer. Not a timer either, since Vite re-executes this
        // module on every save and would leak one per edit.
        void sweepExpiredRunLogs().catch((failure) => {
          console.error('[delivery-log] sweep failed', failure)
        })

        const { messages, threadId, runId } = await chatParamsFromRequestBody(
          parsedBody.data,
        )
        
        const stream = chat({
          adapter: textAdapter,
          messages,
          threadId,
          runId,
          // Order is load-bearing: `onFinish` hooks run in array order, and
          // `withThinkingPersistence` patches the row the one before it wrote.
          middleware: [withPersistence(chatPersistence), withThinkingPersistence],
        })

        // The run id goes to the store explicitly: it is the client's own id
        // for this run, and it is the one the client will come back with.
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
