/**
 * Where a resume says it wants to start from: `Last-Event-ID` first, then
 * `?offset`.
 *
 * The library applies this precedence in its own transports but does not export
 * it, so it has to be restated here — including the truthiness test, so that an
 * empty `Last-Event-ID` falls through to `?offset` exactly as it does there.
 *
 * There is exactly one copy of it: the endpoint validates a resume with it and
 * the durability backend resolves its run with it. Two readings of the same
 * request that disagreed would reject resumes the transport would have served.
 */
export function resolveResumeOffset(request: Request) {
  const header = request.headers.get('Last-Event-ID')

  if (header) return header

  try {
    return new URL(request.url).searchParams.get('offset')
  } catch {
    return null
  }
}
