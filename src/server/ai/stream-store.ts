import type { StreamDurability } from '@tanstack/ai'
import { postgresStream } from '@/server/ai/postgres-stream'

/**
 * The run log every durable run is written to and replayed from.
 *
 * Callers hand over the incoming request and get back a durability adapter.
 * Which backend is behind it is this module's business alone — nothing else may
 * import a backend, so swapping one log for another is a change to this file
 * and no other. That seam has now been used once: the in-memory backend this
 * started on was replaced here, and the endpoint above did not move.
 *
 * The declared return type is deliberately the narrow `StreamDurability`. The
 * optional upsert capability is not implemented and must not be leaked, so that
 * no caller can come to depend on a capability a future backend may not have.
 *
 * The log lives in Postgres, so it outlives the process that produced it: a run
 * that finished before a restart still replays afterwards. It does **not**
 * survive its producer dying mid-run — that log is never terminalised, and no
 * other process takes the run over. Tier 2, not tier 3.
 *
 * A resumer passes the request alone: which run it wants is written on the
 * request, as an offset that encodes its own run or an explicit run id.
 *
 * A producer passes the run it is starting, because that identity lives in the
 * request *body* and the request alone cannot reveal it. Left to the request, a
 * backend mints an id of its own — and a run logged under an id the client
 * never learns is unrejoinable from the moment it starts, silently. This
 * argument is the run's own identity, not a backend detail: every backend keys
 * its log by run id, including this one.
 */
export function streamStore(
  request: Request,
  producedRunId?: string,
): StreamDurability {
  return producedRunId === undefined
    ? postgresStream(request)
    : postgresStream({ runId: producedRunId })
}
