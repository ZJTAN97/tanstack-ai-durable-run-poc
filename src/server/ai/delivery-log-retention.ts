import { and, isNull, lt, or, sql } from 'drizzle-orm'
import { PRODUCER_SILENCE_TIMEOUT_MS } from '@/server/ai/stream-store'
import { db } from '@/server/db/client'
import { deliveryLogs } from '@/server/db/schema/delivery-logs'
import { env } from '@/server/env'

/**
 * How long past its last sign of life a never-closed log becomes reclaimable.
 *
 * Derived from the reader's own patience rather than chosen independently. A log
 * with no `closedAt` is either mid-stream or was orphaned by a producer that
 * died, and only time separates the two — so the safe floor is the point at
 * which a reader would itself have given up waiting. Anything below that floor
 * could delete a log a live reader is still parked on. The multiple is the
 * margin for a reader that began its wait late.
 */
const ABANDONED_LOG_TIMEOUT_MS = PRODUCER_SILENCE_TIMEOUT_MS * 20

function expiredBefore(ageMilliseconds: number) {
  return sql`now() - make_interval(secs => ${ageMilliseconds / 1000})`
}

/**
 * Reclaim delivery logs that no reader can still legitimately want.
 *
 * The delete targets the log rows alone; the event table's `onDelete: 'cascade'`
 * takes their chunks with them, so the cursor scheme and the events stay in one
 * place rather than being reclaimed by two competing rules.
 *
 * Two predicates because there are two ways for a log to be finished, and the
 * log table's own comment already distinguishes them: terminalised cleanly by
 * its producer's `close()`, or abandoned by a producer that died without one.
 * They expire on separate clocks because they are separate claims — one about
 * how long a *finished* reply stays fetchable, one about how long to wait before
 * calling a silent producer dead.
 */
export async function sweepExpiredDeliveryLogs() {
  const reclaimed = await db
    .delete(deliveryLogs)
    .where(
      or(
        // No null guard needed here: a null `closedAt` cannot satisfy the
        // comparison, so an unclosed log falls through to the second predicate
        // and its own, much longer, clock.
        lt(
          deliveryLogs.closedAt,
          expiredBefore(env.DELIVERY_LOG_RETENTION_SECONDS * 1000),
        ),
        and(
          isNull(deliveryLogs.closedAt),
          lt(deliveryLogs.startedAt, expiredBefore(ABANDONED_LOG_TIMEOUT_MS)),
        ),
      ),
    )
    .returning({ runId: deliveryLogs.runId })

  // Retention that leaves no trace is retention you cannot demonstrate, which
  // in a POC about durability is the whole point of running it.
  if (reclaimed.length > 0) {
    console.info(
      `[delivery-log] reclaimed ${reclaimed.length} expired log(s) and their events`,
    )
  }

  return reclaimed.length
}
