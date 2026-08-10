import {
  chat,
  chatParamsFromRequestBody,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { resumeRunRequestSchema, startRunRequestSchema } from '@/schema/chat'
import { textAdapter } from '@/server/ai/adapter'
import { chatPersistence } from '@/server/ai/chat-persistence'
import { resolveResumeOffset } from '@/server/ai/resume-position'
import { streamStore } from '@/server/ai/stream-store'

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
 * was said, rather than what was streamed. The client remains authoritative, so
 * each save overwrites the server's copy with the transcript it posted.
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

        const { messages, threadId, runId } = await chatParamsFromRequestBody(
          parsedBody.data,
        )
        const stream = chat({
          adapter: textAdapter,
          messages,
          threadId,
          runId,
          middleware: [withPersistence(chatPersistence)],
        })

        // The run id goes to the store explicitly: it is the client's own id
        // for this run, and it is the one the client will come back with.
        return toServerSentEventsResponse(stream, {
          durability: { adapter: streamStore(request, runId) },
        })
      },

      // A rejoin arrives here as `?offset=-1&runId=…`; a native SSE reconnect
      // arrives as a `Last-Event-ID` header carrying the last offset delivered.
      GET: ({ request }) => {
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
