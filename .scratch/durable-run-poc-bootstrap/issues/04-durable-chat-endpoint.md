# 04 — Durable chat endpoint: POST starts a run, GET resumes one

**What to build:** The HTTP contract the whole POC rests on. One endpoint with two handlers:

- **POST** starts a run and streams it back over Server-Sent Events, while persisting every chunk to the durability log as it goes. Each event carries a resumable offset.
- **GET** replays an existing run from that log, from a supplied offset, **without re-running the model**.

A POST-only endpoint is not durable. Both handlers are the deliverable.

The endpoint must not know which durability backend is in use — it takes the wrapper from ticket 03 and passes it through.

**This is the tracer bullet, and it is verifiable without an API key.** A resume request that names no offset has nothing to replay and is rejected with `400`. A resume request for a run that does not exist fails loudly rather than hanging open. Those two behaviours prove the durability plumbing is connected before any UI exists.

Worth recording for the reviewer: when durability is wired, a client disconnecting mid-stream does **not** abort the run. The server keeps pulling the model and draining into the log with nobody listening, so a rejoining client can finish the reply. That behaviour is provided by the framework, not implemented here — this ticket's job is to wire it correctly and confirm it.

**Blocked by:** 03

**Status:** done

- [x] POST streams a run and appends every chunk to the durability log
- [x] Each streamed event carries a resumable offset
- [x] GET replays a run from an offset without invoking the model
- [x] A resume request carrying no offset is rejected with `400`
- [x] A resume request for an unknown run fails loudly and promptly — it does not hang
- [x] The endpoint contains no reference to the specific durability backend
- [x] Request input is validated at the boundary
- [x] The `400` and unknown-run behaviours are demonstrated with a real request and the output recorded in the ticket's completion notes

## Completion notes

Shipped `src/routes/api.chat.ts` (the endpoint) and `src/schema/chat.ts` (the two
boundary schemas), plus a one-argument widening of `streamStore` — see below.
The endpoint names no backend.

**The active backend is `memoryStream`**, stated plainly as CLAUDE.md §4
requires: logs live in a process-global map. Everything demonstrated here
survives a dropped connection, a page reload and a second tab, but **not a
server restart**, and cannot be shared across processes. This proves reconnect.
The POC's durability claim still needs the Postgres run log.

### The defect this ticket found: the run log is keyed from the *request*

The durability adapter resolves the run it is writing to from the request
(`X-Run-Id`, then `?runId`) — **not** from the AG-UI body. A POST that names its
run only in JSON therefore appends to a log under a freshly minted random UUID,
which no client can ever ask for: the run is unrejoinable from the instant it
starts, and nothing fails while it happens. Found empirically — a POST carrying
`runId` in the body replayed as an unknown run.

The first fix was a boundary check requiring the request and body to name the
same run, on pain of `400`. Code review rejected it as the right problem at the
wrong layer, and that was correct: the endpoint has already parsed the run id,
so making the client repeat it in the URL is an invented protocol obligation
that would have landed on ticket 06.

`streamStore` now takes the run being produced:

```ts
streamStore(request, runId)   // producer — identity comes from the body
streamStore(request)          // resumer  — identity is on the request
```

This does reopen ticket 03, which deliberately gave the wrapper a
request-and-nothing-else signature. That decision was explicitly made "for a
caller that does not exist"; the caller now exists and has a real need. It is
not the leak ticket 03 was guarding against either — `runId` is the POC's own
vocabulary (CLAUDE.md §4) and every backend keys its log by it, the Postgres one
included. The rejected argument was `offset`, which is genuinely backend shape.

`resolveResumeRunId` is imported from `@tanstack/ai` rather than reimplemented,
so the endpoint and the adapter cannot drift on that precedence. The matching
offset reader is *not* exported, so `resolveResumeOffset` mirrors it by hand —
including its truthiness test, which a first draft got wrong with `??`: an empty
`Last-Event-ID` header would have been read as an offset and 400'd a resume the
transport would have served. Verified fixed (below).

### Zod at the boundary, alongside the framework's own check

`chatParamsFromRequestBody` structurally validates the AG-UI contract, but the
POC's invariant is narrower and it does not own it: a run whose `threadId` or
`runId` is absent or empty can never be rejoined. `startRunRequestSchema` is
`z.looseObject` — the AG-UI body legitimately carries fields this POC does not
read (tools, state, forwarded props), and stripping them would corrupt the
payload handed on for normalisation.

`resumeRunRequestSchema` adds the one rule the transport cannot enforce: a
positional offset (`-1` / `now`) does not name a run, so it needs a `runId`
beside it. Without that check a positional resume naming no run mints a random
id and waits out the 100 ms first-chunk deadline before failing — a `400` is the
honest answer. A backend-minted offset already encodes its run, so it stands
alone, which is what keeps native `Last-Event-ID` reconnects working.

Note that the *no offset at all* `400` is the transport's, not ours — the schema
permits a null offset. The transport owns the offset format, so it owns that
rejection.

### Demonstrations (real requests against `pnpm dev`)

Resume with no offset:

```
$ curl -i 'localhost:3000/api/chat?runId=nope'
HTTP/1.1 400
No resume offset provided (expected a Last-Event-ID header or an ?offset query parameter).
```

Resume with a positional offset naming no run — rejected at our boundary:

```
$ curl -i 'localhost:3000/api/chat?offset=-1'
HTTP/1.1 400
✖ a resume must name a run: send runId (or an X-Run-Id header) alongside a positional offset
```

Resume of an unknown run — loud and prompt, **249 ms wall clock**, not a hang:

```
$ curl -N 'localhost:3000/api/chat?runId=nope&offset=-1'
data: {"type":"RUN_ERROR","message":"Memory stream run produced no data within 100ms: \"nope\""}
```

Empty `Last-Event-ID` falls through to `?offset` rather than 400ing — the
regression the hand-mirrored reader was fixed for:

```
$ curl -i -H 'Last-Event-ID;' 'localhost:3000/api/chat?runId=nope&offset=-1'
HTTP/1.1 200      ← served as a resume, then the unknown-run RUN_ERROR
```

Malformed body, via `z.prettifyError`:

```
$ curl -i -X POST localhost:3000/api/chat -d '{"threadId":"","messages":[]}'
HTTP/1.1 400
✖ Too small: expected string to have >=1 characters
  → at threadId
✖ Invalid input: expected string, received undefined
  → at runId
✖ a run needs at least one message
```

### The happy path — verified, but not through the model

**The `OPENROUTER_API_KEY` in `.env` is dead.** Called directly:

```
$ curl https://openrouter.ai/api/v1/chat/completions -H "Authorization: Bearer $KEY" ...
HTTP 401 {"error":{"message":"User not found.","code":401}}
```

`chat()` reaches the provider eagerly, so it throws `HTTPError` before
`toServerSentEventsResponse` is ever called and the POST returns a bare `500`
with nothing appended to the log. That is a credentials problem, and it will
block ticket 06 too. **A working key is needed before the UI phase.**

It also exposes a real gap, disclosed rather than fixed: because the throw
happens outside the durable stream, no `RUN_ERROR` is logged, so a client
holding that runId rejoins into "unknown run" instead of seeing the failure.
Not in this ticket's scope, but it belongs on someone's list.

The durability plumbing itself was verified without the model, using a
throwaway `src/routes/api.durability-check.ts` — identical wiring including
`streamStore(request, runId)`, with a synthetic chunk generator in place of
`chat()`. Deleted afterwards; not in the tree. (Same approach ticket 03 used for
its env-failure demonstration.)

The decisive run. `run-C` was POSTed with its id **in the body only, no query
string**, and the client was killed after 0.4 s having seen just two events:

```
$ curl --max-time 0.4 -X POST localhost:3000/api/durability-check -d '{"runId":"run-C"}'
id: memory:v1:run-C:1   data: {"type":"CUSTOM","name":"run.accepted",...}
id: memory:v1:run-C:2   data: {"type":"RUN_STARTED",...}
curl: (28) Operation timed out after 419 milliseconds
```

The offsets are keyed `run-C` — the body's id, which is the whole point of the
widening. Rejoining from start returned all eight events, the first two
**byte-identical including their original `timestamp`** (proof of replay, not
re-run), plus events 3–8, which were produced with nobody listening at all:

```
$ curl 'localhost:3000/api/durability-check?runId=run-C&offset=-1'
id: memory:v1:run-C:1 ... 2   ← same timestamps as above
id: memory:v1:run-C:4 "durable "
id: memory:v1:run-C:5 "run "
id: memory:v1:run-C:6 "works"
id: memory:v1:run-C:8 RUN_FINISHED
```

Earlier passes of the same fixture also confirmed a mid-stream rejoin from a
minted offset (`offset=memory:v1:run-B:4` → events 5–8 only) and a native SSE
reconnect (`Last-Event-ID: memory:v1:run-A:6`, no query parameters at all →
events 7–8), the latter confirming that a minted offset carries its own run
identity.

### Notes for tickets 05/06

- A working OpenRouter key is a prerequisite. Nothing user-facing can be
  demonstrated without one.
- The client needs no run id in the POST URL — the body is authoritative. It
  does need `?runId=` (or `X-Run-Id`) on the GET rejoin, unless it is resuming
  from a minted offset.
- The 100 ms unknown-run deadline that makes a bad resume fail promptly is
  `memoryStream`'s. The Postgres adapter must supply its own equivalent, and
  must park rather than return empty while the producer is alive (CLAUDE.md §4).
