# tanstack-ai-durable-run-poc

A proof-of-concept for **TanStack AI durable runs** on **TanStack Start**. The
claim under test: an AI run survives a dropped connection or a page reload — the
client rejoins the same run and replays the events it missed.

See `CLAUDE.md` for the project's standing conventions.

## Requirements

- Node 24+
- pnpm 11+

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # Biome check (lint + format)
pnpm lint --write # auto-fix
pnpm build        # production build into dist/
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

## The durability test

The claim under test: a client that disconnects mid-run rejoins the *same* run and
gets the events it missed, rather than restarting the reply or losing it.

Three different things can put text on the screen after a mid-stream reload, and
only the first is the claim — so the procedure has to distinguish them:

1. the client rejoined a live run and tailed it to completion — **the claim**
2. browser storage repainted a reply that had already finished — **proves nothing**
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

### What this proves, and what it does not

| Covered | Claim |
| :-- | :-- |
| Yes | A client disconnects or reloads while the server keeps running; the run continues and the client rejoins it |
| Later | A completed run's log outlives the process and replays after a restart — needs the Postgres backend |
| **No** | **The server dies mid-run and another process takes the run over and finishes it** |

The durability backend is currently **in-process memory** (`src/server/ai/stream-store.ts`),
so the run log dies with the dev server. That is enough for the first tier and not
for the second.

The third tier is not something the Postgres backend would close. If the process
dies mid-run the producer dies with it, leaving a log that never terminalised — and
a client rejoining it would wait forever for a terminal event that is never
coming. Closing it needs run-takeover machinery (a run store, a lock store,
fencing) and is separate work.

## Routing

Routes are files under `src/routes/`. The Start Vite plugin regenerates
`src/routeTree.gen.ts` on dev and build; never edit it by hand.
