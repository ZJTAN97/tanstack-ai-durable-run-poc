import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'

import { threadSummarySchema } from '@/schema/thread'
import { db } from '@/server/db/client'
import { chatThreads } from '@/server/db/schema/chat-threads'

/**
 * Every conversation the server holds, most recently written first.
 *
 * Reads only the thread rows and never the messages: the list needs a name and
 * a time, and joining the transcript in to derive them would read the whole
 * corpus to render one screen. That is what the `title` column is for.
 *
 * No input, and so no input validator — the POC has no sessions, so there is no
 * "whose threads" to ask. Anything with real users filters here, and the absence
 * of that filter is the reason this endpoint would be unsafe to ship as-is.
 */
export const listThreads = createServerFn().handler(async () => {
  const rows = await db
    .select({
      threadId: chatThreads.threadId,
      title: chatThreads.title,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .orderBy(desc(chatThreads.updatedAt))

  return threadSummarySchema.array().parse(
    rows.map((row) => ({
      threadId: row.threadId,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
  )
})
