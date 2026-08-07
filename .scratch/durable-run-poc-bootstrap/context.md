# Context — TanStack AI durable-run POC bootstrap

Read this before starting any ticket in `issues/`. It carries the decisions, the
verified API facts, and the places where the repo's `CLAUDE.md` is wrong. The
tickets describe *what* to build; this file explains *why it is shaped that way*
and *what not to re-litigate*.

---

## 1. The claim being proven

An AI run survives a dropped connection or a page reload. The client rejoins the
same run and replays the events it missed.

Everything in this repo serves that question. When choosing between more
architecture and a clearer demonstration of durability, choose the latter.

### Scope, stated as tiers

| Tier | Claim | Status in this bootstrap |
| :--- | :--- | :--- |
| 1 | Client disconnects or reloads while the server process stays up; the run keeps producing and the client rejoins | **In scope.** Works with the in-memory backend alone. |
| 2 | A finished run's log outlives the process and replays after a restart | **Next phase.** Needs the Postgres backend. |
| 3 | The server dies mid-run and another process takes the run over and finishes it | **Out of scope.** See below. |

**Tier 3 is not what Postgres buys you.** If the process dies mid-run the
producer dies with it. The log holds a partial run that never terminalised, and
a client rejoining it parks forever waiting for a terminal event that never
arrives. Closing tier 3 needs run-takeover machinery — a run store, a lock
store, fencing epochs, a run driver — and is a separate project.

`CLAUDE.md` §4 frames this as "memoryStream proves reconnect, not durability;
the POC's actual claim requires the Postgres-backed run log." That is only half
right. Postgres upgrades tier 1 → tier 2. It does not reach tier 3. **Do not
let the demo over-claim** — ticket 07 requires the limitation be visible in the
UI, not buried in a README.

### Explicitly dropped from the claim

**A second tab.** Browser storage is shared across tabs of one origin, so a
second tab *will* find the resume pointer and appear to work — but two chat
clients would then tail one run through uncoordinated connections. That is a
demo that works by accident. It is deferred to server-authoritative
persistence and is not claimed anywhere in the UI or docs.

---

## 2. Decisions taken, and why

Each of these was decided deliberately. Do not silently reverse one; if a ticket
seems to require it, stop and raise it.

| Decision | Rationale |
| :--- | :--- |
| **In-memory durability first**, Postgres immediately after | The project owner is learning the TanStack AI API. Landing the full vertical slice on the simple backend first isolates the variable. The wrapper in ticket 03 makes the swap a single-file change. |
| **Client-side persistence** (browser storage), not server-authoritative | No extra package, no extra tables, no hydrate route. Cost: the second-tab case, which is dropped above. |
| **One route, `/`**; thread id in a validated search param | The owner asked for a single page. The URL param satisfies "URL is state", and gives a one-click way to start a clean conversation during repeated demo runs. |
| **No `runs_.$runId/` route** | A run id names one turn and is minted server-side when a run starts. A route segment would name something before it exists. The client's identity is the **thread id**; the run id lives in the persisted resume pointer. |
| **Model: `qwen/qwen3.7-flash`** | Cheapest current Qwen on OpenRouter (verified: $0.030 in / $0.130 out per million, 1M context). Supports `reasoning`, so the `thinking` message-part branch is reachable rather than dead code. |
| **A preset "long run" button** | A fast model finishes before you can press F5. The preset makes the reload window wide and repeatable, turning the core test from "type fast and hope" into a procedure. |
| **No Postgres / Drizzle / Docker in this phase** | Nothing reads them yet. A compose file you must remember to start, backing a database with no tables, is friction on every dev-server start — and half-wired Postgres re-muddies exactly what the status panel exists to keep clear. |
| **Full folder ceremony** per `CLAUDE.md` §9 | Owner's explicit instruction, chosen over a flatter layout. Folder per component, each with its own module stylesheet where styling is genuinely needed. |
| **Scaffold via the CLI**, not hand-rolled | The Vite/Start plugin wiring is fiddly and fails confusingly. Take it from the generator. The owner has previously had this CLI force in Tailwind despite opting out — **ticket 01 requires this be checked and reported, not assumed.** |

---

## 3. Verified API facts

These were read directly from the published packages, not recalled. They are
current as of this planning session. If something below contradicts what you
believe about the API, the package won.

### Versions confirmed on npm

| Package | Version |
| :--- | :--- |
| `@tanstack/ai` | 0.43.0 |
| `@tanstack/ai-react` | 0.19.0 |
| `@tanstack/ai-client` | 0.23.0 |
| `@tanstack/ai-openrouter` | 0.15.11 |
| `@tanstack/react-start` | 1.168.38 |
| `@tanstack/react-router` | 1.170.21 |
| `@mantine/core` | 9.5.1 |
| `vite` | 8.2.1 |

`@tanstack/ai` ships its own `src/` **and a `skills/` directory** of
authoritative docs (`skills/ai-core/…`). When in doubt about the API, read those
before searching the web — `client-persistence/SKILL.md` and
`chat-experience/SKILL.md` are the relevant ones here.

### Two layers, both required

This is the single most important fact in this document, and `CLAUDE.md` omits
it entirely.

| Layer | What it is | What it buys |
| :--- | :--- | :--- |
| **Delivery durability** | A `StreamDurability` adapter passed as `durability:` to the SSE response helper | A client can rejoin an **in-flight** run and replay missed chunks |
| **Persistence** | The `persistence:` option on the chat hook | The client remembers **which run to rejoin** across a reload, and repaints the transcript |

From the shipped docs, verbatim: *"**Still streaming** — needs delivery
durability on the route so the client can `joinRun` and finish the reply.
**Persistence alone is not enough.**"* The converse is equally true: durability
alone leaves a rejoinable log that the page forgets the moment it reloads.

**Building only the durability half — which is all `CLAUDE.md` describes — produces a POC that does not demonstrate its own claim.**

### The disconnect behaviour is built in

From `@tanstack/ai`'s own source (`src/stream-to-response.ts`), on body cancel
when durability is wired:

> Detached durable delivery: the client is gone (e.g. a page reload), but the run
> must finish into the durable log so a rejoining client can tail it to the real
> terminal. **Do NOT abort the producer** (that would kill the run).

So a reload does not cancel the run — the server keeps pulling the model and
draining into the log with nobody listening. **We do not implement this.** Our
job is to wire it correctly and prove it.

### Rejoining is the library's job — do not write an effect

`ChatClient` owns the rejoin internally: `attach()` / `detach()` on mount and
unmount, `applyPersistedResume` to read the stored pointer, and
`resumeInFlightRun()` to replay the log and tail to completion. It even handles
the details you would get wrong by hand — a bounded connect deadline so a stale
pointer to a dead run cannot pin the UI in loading forever, and replaying the
buffered prefix without artificial delay so a reload looks like the run
continued rather than re-typing.

`CLAUDE.md` §4 says *"Rejoining a run is the one legitimate `useEffect` in this
codebase."* **It is not.** Writing that effect duplicates working machinery and
will fight it. **The bootstrap should contain zero `useEffect` calls.**

### Identity

A chat's identity **is** its `threadId`. There is no separate `id` option on the
framework hooks. It must be stable and must never be randomised per mount.

The run id is available from the chat hook as `runId` — the run currently in
flight, started or rejoined, or `null`. One user message can produce several run
ids (resuming after an interrupt continues the turn under a new id).

### The endpoint contract

- POST starts a run and streams SSE, appending each chunk to the log and tagging
  each event with a resumable offset.
- GET replays from the log without re-running the model.
- The resume run id is read from the `X-Run-Id` header first, then a `runId`
  query parameter. The offset comes from the `Last-Event-ID` header or an
  `offset` query parameter.
- **A resume request carrying no offset returns `400`.** This is the documented
  behaviour and is the key-free verification in ticket 04.

### `StreamDurability` has five methods, not two

Relevant to the *next* phase (the Postgres backend), recorded here so it is not
discovered late. `CLAUDE.md` §4 describes only the `read` contract.

- `resumeFrom()` — the offset captured from the request, or `null` for a producer
- `append(chunks)` — persist a batch, return one offset per chunk, same order
- `read(offset, signal)` — replay strictly after `offset`; **park, never return
  empty, while the producer is alive**; respect the abort signal
- `close()` — terminalise the log and unblock live readers; awaited on every
  producer exit including cancellation and failure
- `snapshot()` — everything stored **right now**, in append order, then resolve.
  Must never wait. Must resolve to an empty array for an unknown run rather than
  throwing — it must *not* reuse the from-start-read failure path.

Returning an empty read while the producer lives ends the response and surfaces
to the client as a "stream incomplete" error.

### Status fields available for the panel (ticket 07)

The chat hook already returns everything the panel needs — no custom state:
`runId`, `status`, `connectionStatus`, `isLoading`, `isSubscribed`,
`sessionGenerating`, `error`, `messages`.

---

## 4. Where `CLAUDE.md` is overridden

`CLAUDE.md` is the project's standing law and is otherwise binding. These four
points are **superseded by this document** — they were examined against the
shipped packages and found wrong or incomplete.

1. **§4 "Rejoining a run is the one legitimate `useEffect`."** Superseded. The
   client library owns the rejoin. Zero effects.
2. **§4 durable-run coverage.** Incomplete — it describes delivery durability
   only and never mentions client persistence, without which the reload demo
   cannot work.
3. **§4 "Derive the ids from the route (e.g. `/runs/$runId`)."** Superseded. The
   thread id is the identity and lives in a search param; the run id is not
   routable.
4. **§4 "memoryStream … proves reconnect, not durability; the POC's actual claim
   requires the Postgres-backed run log."** Partially wrong — see the tier table
   in §1.

Everything else in `CLAUDE.md` stands, in particular: the client/server
boundary (§3), boundary validation with Zod (§2), the anti-effect rules (§7),
Mantine-first styling with no inline styles (§8), and the folder and naming
conventions (§9).

---

## 5. Execution

Tickets are in `issues/`, numbered in dependency order.

```
01 scaffold ──┬── 02 mantine shell ────── 05 home route ──┐
              │                                           ├── 06 chat UI ── 07 panel + handover
              └── 03 server boundary ── 04 chat endpoint ─┘
```

**02 and 03 are parallel** after 01. Tickets **01 through 05 need no API key**.
Ticket 04 produces real durability evidence — the `400` contract and the
unknown-run failure — before any UI exists.

Work the frontier: any ticket whose blockers are done. Clear context between
tickets.

### Environment

The `OPENROUTER_API_KEY` is held by the project owner and will be supplied by
them. **Do not attempt to obtain, generate, or work around it.** Tickets 06 and
07 cannot be fully exercised without it.

### Reporting

The owner reviews between tickets. On completing one, state plainly what was
verified by running it and what was not. **Do not report the durability path as
working on the strength of code that has never streamed a token** — if the key
was unavailable, say the path is built but unexercised.

### Repository state at planning time

No commits on `main`. `CLAUDE.md` and this `.scratch/` tree are the only
tracked-or-present files. Ticket 01 introduces a full application tree; do not
commit anything unless the owner asks.
