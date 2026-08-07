import {
  chat,
  chatParamsFromRequestBody,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { resumeRunRequestSchema, startRunRequestSchema } from '@/schema/chat'
import { textAdapter } from '@/server/ai/adapter'
import { streamStore } from '@/server/ai/stream-store'

function badRequest(reason: string) {
  return new Response(reason, {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Where a resume says it wants to start from.
 *
 * Mirrors the precedence the durability adapter itself applies — including its
 * truthiness test, so that an empty `Last-Event-ID` falls through to `?offset`
 * here exactly as it does there. Its own implementation is not exported, and
 * two disagreeing readings of the same request would reject resumes the
 * transport would have served.
 */
function resolveResumeOffset(request: Request) {
  const header = request.headers.get('Last-Event-ID')

  return header || new URL(request.url).searchParams.get('offset')
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

        return resumeServerSentEventsResponse({ adapter: streamStore(request) })
      },
    },
  },
})
