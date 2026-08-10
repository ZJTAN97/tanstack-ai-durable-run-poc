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
| 2 | A finished run's log outlives the process and replays after a restart | **Ticket 09.** The Postgres run log. |
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

Note that **ticket 10 does not close this**, and neither would the
server-authoritative flip that follows it. What changes is that the transcript
stops being the shared mutable thing two tabs fight over; two clients tailing
one run through two connections is unaffected. Do not read either ticket as
claiming the second tab.

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

### Two of these are now deliberately reversed

This section asks that a decision not be silently reversed, and that a ticket
requiring one stop and raise it. Tickets 09 and 10 do require it. Raised here:

**"No Postgres / Drizzle / Docker in this phase" — reversed by ticket 09.** The
rationale was that nothing read them, and a compose file backing a database with
no tables is friction on every dev-server start. That rationale has expired
rather than been overruled: the tables now have a reader, and the tier-2 claim
cannot be made without them.

**"Client-side persistence, not server-authoritative" — partially reversed by
ticket 10, on purpose.** Ticket 10 adds the server's copy but leaves the browser
authoritative, so the cost this decision accepted (the second-tab case) is still
being paid and is still not claimed. The full flip is a further ticket, deferred
on two concrete grounds: the endpoint's GET is already the resume handler and a
hydrate route wants its own verb, and a server-authoritative client posts an
empty message list, which `startRunRequestSchema` currently forbids.

**Still standing, and worth restating because ticket 09 makes it tempting:** no
`runs_.$runId/` route, one page at `/`, thread id in a validated search param.
Persisting runs to a database does not make a run id routable — it is still
minted per turn and a thread can hold many.

---

## 3. Verified API facts

These were read directly from the published packages, not recalled. They are
current as of this planning session. If something below contradicts what you
believe about the API, the package won.

### Versions confirmed on npm

| Package | Planned at bootstrap | Actually installed |
| :--- | :--- | :--- |
| `@tanstack/ai` | 0.43.0 | **0.43.1** |
| `@tanstack/ai-react` | 0.19.0 | **0.19.1** |
| `@tanstack/ai-client` | 0.23.0 | **0.23.1** (transitive) |
| `@tanstack/ai-openrouter` | 0.15.11 | 0.15.11 |
| `@tanstack/react-start` | 1.168.38 | `^1.168.37` |
| `@tanstack/react-router` | 1.170.21 | `^1.170.20` |
| `@mantine/core` | 9.5.1 | `^9.5.1` |
| `vite` | 8.2.1 | `^8.0.0` |

The AI packages resolved one patch above the planned versions. Line numbers cited
elsewhere in this file are read from **0.43.1**, which is what is in the tree.

`@tanstack/ai` ships its own `src/` **and a `skills/` directory** of
authoritative docs (`skills/ai-core/…`). When in doubt about the API, read those
before searching the web — `client-persistence/SKILL.md` and
`chat-experience/SKILL.md` are the relevant ones here. `@tanstack/ai-persistence`
ships a `skills/ai-persistence/` tree the same way, including the Drizzle recipe
ticket 10 depends on.

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

### A terminal chunk does NOT end a read — `close()` does

Read directly from `@tanstack/ai@0.43.1`'s
`src/stream-durability.ts:505-510`, and the single most dangerous thing in
`CLAUDE.md` for ticket 09 to be implemented from:

> A terminal chunk (RUN_FINISHED / RUN_ERROR) does NOT end the read: an
> agent-loop run emits one per iteration (finishReason "tool_calls" then "stop"),
> so stopping on the first would truncate a tool-calling run at its first tool
> call. The producer signals true completion by calling `close()`.

`CLAUDE.md` §4 instructs the opposite — "Stop at a terminal chunk (`RUN_FINISHED`
/ `RUN_ERROR`)". Implemented as written, every reasoning-then-answering and
tool-calling reply would replay only its first segment on rejoin. Our model
reasons before answering, so that failure is reachable today. Terminalisation is
a property of the log, set by `close()`, which the producer calls on **every**
exit including cancellation and failure. See §4 override 5.

### Also verified: `read()` and `snapshot()` must fail differently

Same file. `read('-1')` on an empty or unknown log **may** throw;
`snapshot()` on an unknown run **may not** — it must resolve to `[]`. An
implementation that routes both through one unknown-run path is wrong in one
direction or the other. The reference backend peeks rather than creating in both,
because inserting a row on read would leave a phantom log that no sweep reclaims.

### Chat state is a second package, and it owns no tables

Relevant to ticket 10. Verified on npm and by reading the tarball, not recalled.

| Package | Version | Note |
| :--- | :--- | :--- |
| `@tanstack/ai-persistence` | 0.1.1 | **Pins `@tanstack/ai` to exactly `0.43.1`** — a core bump is a coordinated upgrade |
| `@tanstack/ai-durable-stream` | 0.1.0 | **Not what it sounds like** — see below |

- Both were published days before this planning session. Treat them as new.
- The package ships the four chat store contracts (`MessageStore`, `RunStore`,
  `InterruptStore`, `MetadataStore`), the `withPersistence` middleware,
  `reconstructChat`, an in-memory reference backend, and a conformance testkit.
  It ships **zero tables, zero migrations, and no ORM dependency** — verified by
  searching the whole `@tanstack/` tree for `CREATE TABLE`, `.sql`, and
  `.prisma`: no matches. Its own words: *"Persistence is a contract, not a
  database… You own the schema. No package invents migrations for you."*
- It bundles a **Drizzle recipe** at
  `skills/ai-persistence/build-drizzle-adapter/SKILL.md` with the full store
  bodies and the Postgres column choices. Read it before writing the adapter;
  the idempotency comments in it mark the rules the conformance kit checks.
- `RunStore` and `RunRecord` live in **core**, not this package, deliberately
  shared with `@tanstack/ai-sandbox` so there is one definition of a run.
- **`@tanstack/ai-durable-stream` is not a Postgres backend.** Its own
  description: *"a resumable `StreamDurability` transport sink […] that stores
  **zero** delivery events itself."* It is a client for an external
  durable-streams HTTP service. A database-backed run log is ours to write; this
  package is not a shortcut to ticket 09.
- `MessageStore` is only two methods, and `saveThread` is a **full overwrite** —
  the argument is the complete authoritative transcript, with no diff
  information. Any row-per-message schema must rewrite the thread's rows.
- `ModelMessage.id` is **optional** (`core src/types.ts:378`). It is not a
  guaranteed per-message key, so a diff-based save path cannot rely on it
  without first verifying it survives the client round-trip.
- The authoritative-history contract is decided by the request's message list:
  **non-empty** means the client is authoritative and the server overwrites its
  copy; **empty** means continue from the server's copy. Never post a delta —
  that truncates the stored thread down to the delta.

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
5. **§4 "Stop at a terminal chunk (`RUN_FINISHED` / `RUN_ERROR`)."** Wrong, and
   the most consequential of the five. The library says a terminal chunk does
   **not** end a read; `close()` terminalises the log. Implementing the bullet as
   written truncates every tool-calling and reasoning-then-answering reply at its
   first segment on rejoin. See §3. `CLAUDE.md` is deliberately **not** edited —
   this list is the project's record of divergence, and it is the file to trust
   when the two disagree.

`CLAUDE.md` §5's Postgres guidance is otherwise sound and tickets 09 and 10 follow
it: one pooled client cached on `globalThis` (Vite HMR leaks a pool per save
without it), tables under `src/server/db/schema/` one file per domain, migrations
generated and committed and never hand-edited, `drizzle-kit push` avoided, and
Drizzle owning row types while Zod owns the network boundary. The one permitted
deviation is `drizzle.config.ts` reading `process.env.DATABASE_URL` directly
instead of through `src/server/env.ts`, because that module throws on a missing
`OPENROUTER_API_KEY` and a migration has no business needing a model key.

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
                                                          │
                                             08 chat UI revamp
                                                          │
                                    09 postgres run log ── 10 server chat state
```

**02 and 03 are parallel** after 01. Tickets **01 through 05 need no API key**.
Ticket 04 produces real durability evidence — the `400` contract and the
unknown-run failure — before any UI exists.

**09 and 10 are sequential, not parallel**, and the order is deliberate: 09 lands
the database wiring (container, client, config, migrations, environment) that 10
then reuses, and 09's claim is verifiable on its own. Both keep ticket 04's
pattern of proving the hard contract rules **without an API key** first — an
unknown run, a foreign offset, a rejoin with no position — before spending a key
on the streaming checks. 10 ends on a deliberate stopping point rather than a
finished feature; the server holds a transcript nothing reads back yet, and the
follow-up should be written up as ticket 11 rather than left implicit.

Ticket 07 remains unresolved. Ticket 08 removed the surfaces it was to be built
from, so after 09 a resumed run and a silently re-run one still look identical on
screen — 09 makes the claim *true* and does nothing to make it *visible*. See
ticket 08's Further Notes; that tension is not closed by either new ticket.

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
