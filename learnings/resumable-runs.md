# Resumable runs, end to end

**Touches:** `src/routes/api.chat.ts`, `src/server/ai/stream-store.ts`,
`src/server/ai/postgres-stream.ts`, `src/schema/chat.ts`, `src/schema/thread.ts`,
`src/routes/-page/HomePage/Conversation/`

## Summary

The claim under test: **an AI run survives a dropped connection or a page
reload — the client rejoins the same run and replays the events it missed.**

It requires four things, and dropping any one of them fails the test:

1. **The run must not stop when the client goes away.** Core handles this — the
   producer and the delivery side get separate abort controllers.
2. **Every chunk must be logged somewhere the next request can read.** That's
   `StreamDurability`, backed by Postgres.
3. **The reloaded page must be able to name the run again.** That's
   `reconstructChat`'s `activeRun`, resolved server-side from the thread id.
4. **The thread id must survive the reload.** That's the URL.

```
POST  /api/chat                      → run once, log every chunk
GET   /api/chat?threadId=…           → JSON: transcript + activeRun cursor
GET   /api/chat?runId=…&offset=-1    → SSE: replay from the start
GET   /api/chat  + Last-Event-ID     → SSE: replay from the last chunk delivered
```

---

## The lifecycle

### Starting a run

```ts
POST: async ({ request }) => {
  const parsed = startRunRequestSchema.safeParse(await request.json())
  if (!parsed.success) return badRequest(z.prettifyError(parsed.error))

  const { messages, threadId, runId } = await chatParamsFromRequestBody(parsed.data)

  const stream = chat({
    adapter: textAdapter, messages, threadId, runId,
    middleware: [withPersistence(chatPersistence)],
  })

  return toServerSentEventsResponse(stream, {
    durability: { adapter: streamStore(request, runId) },
  })
}
```

**The run id is handed to the store explicitly, and that is load-bearing.** It
lives in the request *body*; a durability backend constructed from the `Request`
alone cannot see it, so it mints one of its own. A run logged under an id the
client never learns is **unrejoinable from the moment it starts, silently** —
the POST looks perfect and the GET can never find it. This is the single easiest
way to build something that appears to work and isn't.

Hence the asymmetric seam:

```ts
export function streamStore(request: Request, producedRunId?: string): StreamDurability {
  return producedRunId === undefined
    ? postgresStream(request)            // a resumer: the run is written on the request
    : postgresStream({ runId: producedRunId })   // a producer: the run is in the body
}
```

### Disconnecting

Nothing special happens. The browser closing its SSE connection aborts *delivery*;
the producer keeps pulling from the model and calling `append()` with nobody
listening, and eventually calls `close()`, which stamps `closed_at`. That is the
framework's behaviour and the endpoint only wires it.

### Rejoining

Two read-only requests share the GET verb, told apart by **what they name**:

```ts
GET: ({ request }) => {
  if (new URL(request.url).searchParams.has('threadId')) {
    return reconstructChat(chatPersistence, request)      // JSON
  }

  const parsedResume = resumeRunRequestSchema.safeParse({
    runId: resolveResumeRunId(request),
    offset: resolveResumeOffset(request),
  })
  if (!parsedResume.success) return badRequest(z.prettifyError(parsedResume.error))

  try {
    return resumeServerSentEventsResponse({ adapter: streamStore(request) })
  } catch (rejection) {
    return badRequest(String(rejection))                  // a bad offset is a 400, not a 500
  }
}
```

A hydration names a **thread**; a resume names a **run**. Neither is a special
case of the other — different question, different content type.

The `try/catch` exists because the offset's *format* belongs to the log, not to
the route. The only place it can be judged is where the store reads it, and an
offset the store refuses is a bad request, not a server fault. Catching it here
keeps that legible without the route naming a backend.

### The full reload sequence

```
1.  POST /api/chat  { threadId, runId, messages }
       └─ chat() streams; each chunk → append() → delivery_log_events
       └─ withPersistence writes chat_runs (status 'running') + chat_messages

2.  ── user reloads ──
       delivery aborts · producer keeps going · rows keep landing

3.  GET /api/chat?threadId=demo-thread
       └─ reconstructChat → { messages, activeRun: { runId }, interrupts }
          activeRun comes from runs.findActiveRun(threadId)

4.  GET /api/chat?runId=<that id>&offset=-1
       └─ postgresStream.read('-1') replays every stored chunk,
          then parks on LISTEN/NOTIFY and tails the live producer

5.  producer finishes → close() → closed_at set → read() returns → SSE ends
       └─ withPersistence writes status 'completed' + token usage
```

Step 3 is the piece that makes this stronger than a cached transcript. **The
server answers "is a run still going on this thread?"**, so the rejoin works in a
different tab, a different browser, or from a shared URL. A `localStorage`
record makes a reload resumable in *that browser* only.

## Identity: where each id lives, and why

| Id | Lives in | Because |
| :-- | :-- | :-- |
| `threadId` | the URL — `?threadId=` | must survive reload, be shareable, and agree between SSR and client render |
| `runId` | minted per turn, tracked by `useChat` | a run names one turn; a route segment would mean naming it before it exists |

Two schemas guard them, at different strictness, deliberately:

- **`src/schema/chat.ts`** guards the request body a *client composes*: non-empty,
  no CR/LF (they'd corrupt an SSE `id:` line).
- **`src/schema/thread.ts`** guards the one place a *human types* an id: ≤64
  chars, `[A-Za-z0-9_-]` only. Keeping what the address bar can express to
  plainly URL-safe characters means the id read off the screen is the id that
  travels onward, unescaped.

Two decisions in `thread.ts` that look small and aren't:

- **The default thread id is a constant**, not a fresh UUID. Minting one there
  would hand a different conversation to every load — including the reload the
  POC is trying to survive — and would disagree between the server render and the
  client one.
- **Absent and malformed are treated differently.** Absent is an ordinary first
  visit → the default. Malformed is a URL naming a conversation the app cannot
  address → refused, not silently corrected. *A request for thread A that quietly
  serves thread B is worse than an error.*

And `createThreadId()` is only ever called from an event handler. Called during
render it mints a new id on every mount — precisely the bug that makes a
conversation unresumable.

### Validating a resume

A resume must be able to say **which** run it wants:

```ts
.refine(({ runId, offset }) => runId !== null || offsetNamesItsOwnRun(offset))
```

A backend-minted offset already encodes its run, so it stands alone. The two
positional offsets (`-1`, `now`) do not, so they need an explicit run id beside
them. Without this check a positional resume naming no run is indistinguishable
from a brand new one, and the request goes on to wait out a deadline against a
run that never existed instead of being turned away immediately.

## The client side

```tsx
<Conversation key={threadId} threadId={threadId} />
```

```ts
const { messages, sendMessage, stop, isLoading, error } = useChat(createChatOptions(threadId))
```

That is the whole rejoin implementation. **There is no `useEffect` here, and
there must not be** — `useChat` hydrates from the server and tails the live run
as it constructs its client. A hand-wired stream would be a second consumer of
the same run, racing the one that already exists.

(CLAUDE.md lists "rejoining a run" as the one legitimate `useEffect` in this
codebase. It turned out not to be needed at all, because the library owns it.)

## How to actually verify the claim

Three different things can put text on screen after a mid-stream reload, and only
the first is the claim:

1. the client rejoined a live run and tailed it to completion — **the claim**
2. browser storage repainted a reply that had already finished — **proves nothing**
3. the model was silently re-run from scratch — **the claim is false**

So the procedure has to distinguish them:

1. **New chat**, so the transcript starts empty.
2. Send a prompt whose reply takes a while — *"Count from 1 to 1500, each number
   as a word on its own line."* A reply that finishes before you can reload tests
   nothing; it lands you in case 2.
3. DevTools → Network, filter `chat`.
4. Reload while the reply is still being written.
5. Confirm **all three**:
   - the reply **carries on from where it was** — it does not restart and does not
     stop short;
   - the network panel shows `GET /api/chat?offset=…&runId=…` — a page rejoining a
     run *by name*, which rules out case 2;
   - that `runId` is the one the run started under, which rules out case 3.

Cross-checks worth running once: rejoin from a **second tab** on the same URL
(kills the browser-storage explanation outright), and `select count(*) from
delivery_log_events where run_id = …` climbing while no client is connected.

## Tiers of durability — say which one you have

| Tier | Claim | Here |
| :-- | :-- | :-- |
| 1 | Client disconnects/reloads, server keeps running, client rejoins | ✅ |
| 2 | A completed run's log outlives the **process** and replays after a restart | ✅ via Postgres |
| 3 | The **server dies mid-run** and another process takes the run over and finishes it | ❌ |

**`memoryStream` gets you tier 1 and stops there.** Its logs live in a
process-global map, so they die with the dev server. A memory-backed run that
survives an F5 is not evidence of a durable run, and a demo that doesn't name its
backend is claiming something it isn't showing.

Tier 3 is not something a Postgres log closes. If the process dies mid-run the
producer dies with it and the log is never terminalised — the mid-run wait bound
is what turns that into an *error* rather than a client parked forever. Closing
it needs run-takeover machinery: a lock store, fencing, a driver epoch, and a
process willing to resume the model call. `@tanstack/ai` ships the hooks
(`defineRunStore`, `DetachableRunCapability`, the `locks` export) and `chat_runs`
already has the columns (`detachedSince`, `cancelRequested`, `driverEpoch`,
`sandboxKey`) because the store contract asks for them. It is separate work.

## Known regression, recorded on purpose

Delivery-log retention introduced one: a client away longer than the retention
window that returns with a stale run pointer now gets `Unknown run log` surfaced
as an error, where it previously replayed. The right fix is not a longer window —
it is to fall back to the server-side transcript for a *finished* run, which
should never have been the delivery log's job. Left undone deliberately;
written down so it isn't rediscovered as a mystery bug.

## Transferable lessons

- **Durability is two guarantees, not one.** "The run keeps going" and "the client
  can find it again" are independent, and the second is the one people forget.
  A resumable log whose name nobody remembers is not resumable.
- **Hand the producer its id; never let the backend invent one.** The failure is
  silent, and it fails at exactly the moment you need it.
- **Put the identity that must survive a reload in the URL.** It survives, it's
  shareable, and it's stable across SSR — three properties React state has none
  of.
- **Distinguish absent from malformed at every boundary.** Defaulting an absent
  value is helpful; defaulting a malformed one silently serves the wrong data.
- **A test that can pass for three different reasons is not a test.** Write the
  procedure so the wrong reasons are visibly excluded — the network panel and the
  run id are what turn "text appeared" into evidence.
- **State your tier.** "Durable" without a tier is marketing. Naming the tier
  makes the gap concrete and the next piece of work obvious.
