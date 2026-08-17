import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  applyThreadWrite,
  threadWriteSchema,
} from '@/server/powersync/thread-writes'
import { readTokenSubject } from '@/server/powersync/token'

const uploadBatchSchema = z.object({
  writes: z.array(threadWriteSchema).max(100),
})

/**
 * Where Sync's client-side writes land.
 *
 * The batch is all-or-nothing: one invalid operation rejects the whole request
 * rather than partially applying it. PowerSync keeps a rejected batch queued and
 * retries, so a partial apply would replay the operations that already succeeded
 * — and there is no shape of "half a batch" the client could reconcile against.
 *
 * Operations run in order. They are already ordered by the local write queue, and
 * a delete that overtook the insert it follows would resurrect the row.
 */
export const Route = createFileRoute('/api/powersync-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const subject = await readTokenSubject(request)
        if (subject === null) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => null)
        const batch = uploadBatchSchema.safeParse(body)
        if (!batch.success) {
          return Response.json(
            { error: z.prettifyError(batch.error) },
            { status: 400 },
          )
        }

        for (const write of batch.data.writes) {
          await applyThreadWrite(write, subject)
        }

        return new Response(null, { status: 204 })
      },
    },
  },
})
