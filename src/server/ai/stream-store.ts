import { memoryStream, type StreamDurability } from '@tanstack/ai'

/**
 * The run log every durable run is written to and replayed from.
 *
 * Callers hand over the incoming request and get back a durability adapter.
 * Which backend is behind it is this module's business alone — nothing else may
 * import a backend, so swapping the in-memory log for a Postgres-backed one is
 * a change to this file and no other.
 *
 * The declared return type is deliberately the narrow `StreamDurability`.
 * `memoryStream` also satisfies `UpsertableStreamDurability`; leaking that
 * would let a caller depend on a capability the replacement backend may not
 * have.
 *
 * The in-memory backend keeps its logs in a process-global map, so it survives
 * a dropped connection and a page reload but not a server restart, and it
 * cannot be shared across processes. It proves reconnect, not durability.
 *
 * A resumer passes the request alone: which run it wants is written on the
 * request, as an offset that encodes its own run or an explicit run id.
 *
 * A producer passes the run it is starting, because that identity lives in the
 * request *body* and the request alone cannot reveal it. Left to the request, a
 * backend mints an id of its own — and a run logged under an id the client
 * never learns is unrejoinable from the moment it starts, silently. This
 * argument is the run's own identity, not a backend detail: every backend keys
 * its log by run id, including the Postgres one that replaces this.
 */
export function streamStore(
  request: Request,
  producedRunId?: string,
): StreamDurability {
  return producedRunId === undefined
    ? memoryStream(request)
    : memoryStream({ runId: producedRunId })
}
