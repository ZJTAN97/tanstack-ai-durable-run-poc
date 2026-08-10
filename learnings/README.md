# Learnings

What this POC actually taught us, written down so it doesn't have to be
rediscovered by reading the source.

## The four topics

| Document | Answers |
| :-- | :-- |
| [tanstack-ai-key-apis.md](./tanstack-ai-key-apis.md) | Which APIs exist, which ones you actually need, and what each one owns |
| [postgres-integration.md](./postgres-integration.md) | The two Postgres layers, their tables, and the contracts their adapters must satisfy |
| [resumable-runs.md](./resumable-runs.md) | How a reload rejoins a live run end to end, and which tier of durability that is |
| [server-vs-client-boundary.md](./server-vs-client-boundary.md) | What runs where, and what leaks if you get it wrong |

Two earlier, narrower findings:

- [a-delivery-log-is-a-buffer-not-a-record.md](./a-delivery-log-is-a-buffer-not-a-record.md) — why retention is part of the log's definition
- [delivery-log-grows-quadratically-in-reply-length.md](./delivery-log-grows-quadratically-in-reply-length.md) — the `content`-beside-`delta` amplification bug

---

# Summary

## The one idea

**A durable run is two independent layers, and the whole design follows from
keeping them apart.**

| | **Delivery durability** | **Conversation persistence** |
| :-- | :-- | :-- |
| Answers | what was **streamed** | what was **said** |
| Unit | one row per stream chunk | one row per message |
| Wired via | `durability: { adapter }` on the SSE response | `middleware: [withPersistence(...)]` on `chat()` |
| Contract | `StreamDurability` (5 methods) | `ChatPersistence` (4 stores) |
| Tables | `delivery_logs`, `delivery_log_events` | `chat_threads`, `chat_messages`, `chat_runs`, `chat_interrupts`, `chat_metadata` |
| Lifetime | minutes — it's a buffer | as long as the conversation |
| Deleting it loses | nothing | the conversation |

Neither alone passes the test. Delivery durability without persistence gives you
a resumable log whose name the reloaded page has forgotten. Persistence without
delivery durability repaints a transcript with a reply that can never finish.

In this repo they share **no code**, on purpose.

## The endpoint contract, in four lines

```
POST  /api/chat                      → run the model once, log every chunk
GET   /api/chat?threadId=…           → JSON: stored transcript + activeRun cursor
GET   /api/chat?runId=…&offset=-1    → SSE: replay the log from the start
GET   /api/chat  + Last-Event-ID     → SSE: replay from the last chunk delivered
```

A POST-only endpoint is not durable. Both GET shapes share one verb and are told
apart by *what they name* — a thread or a run. Neither is a special case of the
other: different question, different content type.

## What actually happens on a mid-stream reload

1. The browser drops. **The run does not stop** — core gives the producer and the
   delivery side separate abort controllers, so the model keeps draining into the
   log with nobody listening.
2. `useChat` mounts and issues `GET ?threadId=…`. `reconstructChat` answers with
   the transcript **and `activeRun: { runId }`**, resolved server-side from
   `runs.findActiveRun(threadId)`.
3. The client tails that run over SSE. The reply carries on mid-sentence.

The load-bearing piece is step 2: the *server* answers "is a run still going on
this thread?". That is what makes the rejoin work in a different tab, a different
browser, or from a shared URL — which a `localStorage` cache cannot do.

## The smallest working API set

```ts
// server
chat({ adapter, messages, threadId, runId, middleware: [withPersistence(p)] })
toServerSentEventsResponse(stream, { durability: { adapter } })   // POST
resumeServerSentEventsResponse({ adapter })                       // GET resume
reconstructChat(persistence, request)                             // GET hydrate
chatParamsFromRequestBody(body)  ·  resolveResumeRunId(request)

// client
useChat(createChatClientOptions({ connection, persistence: true, threadId }))
fetchServerSentEvents('/api/chat')
```

That is the whole surface this POC needed out of a very large library.

## Five things that will bite you

1. **`memoryStream` proves reconnect, not durability.** It lives in a
   process-global map. Say which backend is active when you demo, or the demo
   claims something it doesn't show.
2. **A producer must be handed its run id explicitly.** The id lives in the request
   *body*; a backend constructed from the `Request` alone mints its own, and a run
   logged under an id the client never learns is unrejoinable from the moment it
   starts — silently.
3. **Never return an empty read while the producer is alive.** An empty read ends
   the response and surfaces as *"stream incomplete"*. Park on LISTEN/NOTIFY
   instead — but bound the park, because a database-backed log outlives its
   producer and an orphaned log would hang a reader forever.
4. **Don't stop the read at the first terminal chunk.** An agent loop emits one per
   iteration; stopping there truncates a tool-calling run at its first tool call.
   `close()` is the only terminalisation.
5. **`reconstructChat` has no tenancy.** Without an `authorize` callback, anyone
   who guesses a `?threadId=` gets the full transcript.

## Server / client, in one table

| Concern | Where | Why |
| :-- | :-- | :-- |
| API key, adapter, model name | `src/server/ai/adapter.ts` | one line names a model, nothing else |
| Durability backend | `src/server/ai/stream-store.ts` | the only module allowed to name Postgres |
| Transcript + run lifecycle | `src/server/ai/chat-persistence.ts` | authoritative copy |
| Thread id | **the URL** (`?threadId=`) | survives reload, shareable, SSR-stable |
| Run id | minted per turn, tracked by `useChat` | naming it in the route means naming it before it exists |
| Transcript cache | **nowhere on the client** | `persistence: true` is server-authoritative |

The single most useful client-side rule: **`useChat` already tails the run.**
Adding a `useEffect` that rejoins the stream yourself creates a second consumer
racing the one that already exists.

## Honest scope

This POC is **tier 2** of three:

| Tier | Claim | Status |
| :-- | :-- | :-- |
| 1 | Client drops, server keeps running, client rejoins | ✅ |
| 2 | A finished run's log outlives the process and replays after a restart | ✅ (Postgres) |
| 3 | The **server** dies mid-run and another process finishes the run | ❌ |

Tier 3 is not something a Postgres log closes. If the process dies the producer
dies with it, leaving a log nothing ever terminalises. Closing it needs run
takeover — locks, fencing, a driver epoch. The `chat_runs` columns
(`detachedSince`, `cancelRequested`, `driverEpoch`, `sandboxKey`) exist because
the store contract asks for them, and are the hooks that work would use.
