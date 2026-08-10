# tanstack-ai-durable-run-poc

A proof-of-concept for **TanStack AI durable runs** on **TanStack Start**. The
claim under test: an AI run survives a dropped connection or a page reload — the
client rejoins the same run and replays the events it missed.

See `CLAUDE.md` for the project's standing conventions, and `learnings/` for what
building it actually taught us — the API surface that matters, both Postgres
integration points, the resumable-run lifecycle, and the client/server boundary.

## Requirements

- Node 24+
- pnpm 11+
- Docker (for Postgres)

## Setup

```bash
pnpm install
cp .env.example .env     # then fill in OPENROUTER_API_KEY
docker compose up -d     # Postgres on localhost:5432
pnpm db:migrate          # apply the schema
pnpm dev                 # http://localhost:3000
```

Every environment variable is parsed by `src/server/env.ts` at boot, so a missing
or malformed value stops the server with an explanation rather than failing on
the first chat request.

## Commands

```bash
pnpm dev          # http://localhost:3000
pnpm lint         # Biome check (lint + format)
pnpm lint --write # auto-fix
pnpm build        # production build into dist/

pnpm db:generate  # write SQL migrations from the Drizzle schema
pnpm db:migrate   # apply them
pnpm db:studio    # inspect the data

docker compose down     # stop Postgres; add -v to wipe the volume,
                        # which destroys the run history this POC demonstrates
```

## Production serving

`pnpm build` emits `dist/server/server.js`, which exports a Web-standard
`{ fetch }` handler rather than a listening server. Serving it needs a TanStack
Start deployment adapter (nitro, cloudflare, netlify, railway), which this POC
does not install — the demo runs on `pnpm dev`.

## Addressing a conversation

The conversation's identity lives in the URL as `?threadId=`, which is what makes
a reload land back in the same conversation and makes the page shareable. Omit it
for the default conversation, edit it by hand to address another, or use **New
chat** in the header to mint a fresh one. A thread id may contain only letters,
digits, `-` and `_`, up to 64 characters; anything else is refused rather than
silently corrected.

The interface says none of this. It is an ordinary chat app on purpose — the
durability machinery is invisible while it works, so the run id and status
readouts that used to be on screen are gone. That means the claim below has to be
checked deliberately; it is no longer legible from a screenshot.

## What is stored where

Two independent layers live in Postgres, and keeping them apart is most of the
design. They share no code.

| | **Delivery log** | **Conversation transcript** |
| :-- | :-- | :-- |
| Answers | what was **streamed** | what was **said** |
| Tables | `delivery_logs`, `delivery_log_events` | `chat_threads`, `chat_messages`, `chat_runs`, … |
| Unit | one row per stream chunk | one row per message |
| Wired via | `durability: { adapter }` on the SSE response | `middleware: [withPersistence(…)]` on `chat()` |
| Lifetime | minutes — it is a transport buffer, and expires | as long as the conversation |
| Deleting it loses | nothing | the conversation |

Both are needed. The delivery log alone gives a resumable run whose name the
reloaded page has forgotten; the transcript alone repaints a reply that can never
finish. The reload works because the *server* answers "is a run still going on
this thread?" — so a rejoin also works in a second tab, or from a shared URL.

The browser caches nothing (`persistence: true` is server-authoritative). See
`learnings/postgres-integration.md` for the adapter contracts.

## The durability test

The claim under test: a client that disconnects mid-run rejoins the *same* run and
gets the events it missed, rather than restarting the reply or losing it.

Three different things can put text on the screen after a mid-stream reload, and
only the first is the claim — so the procedure has to distinguish them:

1. the client rejoined a live run and tailed it to completion — **the claim**
2. a stored transcript repainted a reply that had already finished — **proves nothing**
3. the model was silently re-run from scratch — **the claim is false**

Procedure:

1. `pnpm dev`, open <http://localhost:3000>, and click **New chat** so the
   transcript starts empty.
2. Send a prompt whose reply takes a while, e.g. *"Count from 1 to 1500. Write
   each number as a word on its own line."* A reply that finishes before you can
   reload tests nothing — it lands you in case 2.
3. Open DevTools → Network, and filter for `chat`.
4. While the reply is still being written, reload the page.
5. Confirm all three:
   - the reply **carries on from where it was** and runs to completion — it does
     not restart from the beginning and does not stop short;
   - the network panel shows a **`GET /api/chat?offset=…&runId=…`** — the reloaded
     page rejoining a run by name, which rules out case 2;
   - that `runId` is the one the run started under, which rules out case 3.

Two cross-checks worth running once, because they kill the remaining doubt:
open the same URL in a **second tab** mid-run (a browser cache cannot explain
that), and watch `select count(*) from delivery_log_events where run_id = …`
climb while no client is connected at all.

### What this proves, and what it does not

| Tier | Claim | Status |
| :-- | :-- | :-- |
| 1 | A client disconnects or reloads while the server keeps running; the run continues and the client rejoins it | **Yes** |
| 2 | A completed run's log outlives the process and replays after a restart | **Yes** |
| **3** | **The server dies mid-run and another process takes the run over and finishes it** | **No** |

The durability backend is **Postgres** (`src/server/ai/stream-store.ts` →
`postgres-stream.ts`), so a run log outlives the process that produced it: a run
that finished before a restart still replays afterwards. To see tier 2, complete a
run, restart `pnpm dev`, and replay it with
`GET /api/chat?runId=<id>&offset=-1` — within the retention window
(`DELIVERY_LOG_RETENTION_SECONDS`, 60s by default).

The third tier is not something the Postgres backend would close. If the process
dies mid-run the producer dies with it, leaving a log that never terminalised — and
a client rejoining it would wait forever for a terminal event that is never
coming. What the database backend adds is that this now *fails* rather than
hanging: a reader parked on a silent log gives up after
`PRODUCER_SILENCE_TIMEOUT_MS` and says why. Closing the tier properly needs
run-takeover machinery (a lock store, fencing, a driver epoch) and is separate
work; `chat_runs` already carries the columns it would use.

### Known limitation

The delivery log expires, because it is a buffer rather than a record. A client
that stays away longer than `DELIVERY_LOG_RETENTION_SECONDS` and comes back with
a stale run pointer gets `Unknown run log` as an error, where it would previously
have replayed. The fix is not a longer window — it is to fall back to the stored
transcript for a run that has already finished, which was never the delivery
log's job. Deliberately not done; see
`learnings/a-delivery-log-is-a-buffer-not-a-record.md`.

## Routing

Routes are files under `src/routes/`. The Start Vite plugin regenerates
`src/routeTree.gen.ts` on dev and build; never edit it by hand.
