# 09 — Postgres-backed run log: a run that outlives its process

**Blocked by:** 04 (the endpoint this replaces the backend of). Independent of 08.

**Status:** ready-for-agent

**Read first:** `context.md` §1 (the tier table — this ticket is tier 2 and must
not be demoed as tier 3), §2's reversal note, §3's terminal-chunk and
read-versus-snapshot facts, and §4 override 5.

## Problem Statement

The run log lives in the memory of one Node process. Every claim the POC makes about durability is bounded by that process staying alive, and nothing on the page or in the repo makes that boundary visible.

Concretely:

- A user sends a message, the reply starts streaming, and the server restarts — a dev-server save, a crash, a deploy. The browser still holds the transcript and still holds a pointer to the run that was in flight, so on reload it asks the server to rejoin that run. The server has never heard of it. The client's bounded connect deadline fires and the reply stays frozen half-written, permanently. There is no path back to that answer.
- The same is true of a run that *finished*. Its log is gone the moment the process exits, so nothing about a completed run is recoverable or inspectable afterwards.
- The owner has no record of what happened. There is no way to look at a run after the fact, count its events, or see whether it terminated cleanly — the only evidence a run ever existed is whatever the browser happened to keep.
- The POC therefore cannot demonstrate its own headline claim. A reviewer watching a mid-stream reload succeed is watching an in-process map do its job. That is reconnect, and it is worth having, but it is not durability, and the repo currently has no artefact that distinguishes them.

## Solution

Move the run log into Postgres, behind the wrapper ticket 03 built for exactly this purpose.

After this ticket, a run's event log is a row set in a database. A run that has finished can be replayed after the server process has been restarted: the user reloads, the client asks to rejoin, and the server serves the reply back out of Postgres. The owner can open the database and see every run, every event in order, and whether the log was closed cleanly. Local Postgres arrives with the project — a pinned container, a committed migration, and three scripts — so that a fresh clone reaches a working durable run without hunting for setup.

The user-facing behaviour that already works must keep working unchanged: sending a message streams a reply, and reloading mid-stream rejoins the same run and finishes it. This ticket does not add a visible feature. It replaces what is behind an existing one, and makes a claim true that was previously only asserted.

**What this does not buy, stated plainly.** If the process dies *mid-run*, the producer dies with it. The log holds a partial run that never terminalised. That is tier 3 in `context.md` §1 and it stays out of scope; this ticket takes the POC from tier 1 to tier 2 and must not be demonstrated as more.

## User Stories

1. As a user, I want my reply to keep streaming exactly as it does today, so that moving the log into a database costs me nothing I already had.
2. As a user who reloads mid-stream, I want the same reply to carry on to completion, so that the behaviour ticket 06 delivered is not regressed by this change.
3. As a user whose conversation finished before the server restarted, I want to reload and still be able to recover that reply, so that a restart on the server's side does not destroy my answer.
4. As a user, I want a rejoin to a run the server genuinely cannot serve to fail promptly and legibly, so that I am not left watching a spinner that will never resolve.
5. As a user, I want a rejoin to a run that is still producing to wait and then deliver, so that catching up to a live run does not look like an error.
6. As a user, I want a rejoined reply to arrive from where I left off rather than from the beginning, so that I do not watch text I have already read be retyped.
7. As a user, I want a reply that involved the model reasoning or calling a tool to replay in full, so that a rejoin does not silently truncate the turn at its first tool call.
8. As a user, I want to close the tab entirely and come back later to a run that has since finished, so that leaving is not the same as cancelling.
9. As a user on a slow connection whose stream drops without the page reloading, I want the browser's own reconnect to resume from the last event it received, so that a network blip costs me nothing.
10. As the POC's reviewer, I want to stop the server, start it again, and watch a completed run replay out of the database, so that the durability claim is falsifiable rather than asserted.
11. As the POC's reviewer, I want the run log to be inspectable in a database browser, so that I can confirm events were persisted rather than trusting the screen.
12. As the POC's reviewer, I want the scope limit stated in the ticket and honoured in the demo, so that the POC cannot over-claim by omission.
13. As an operator, I want to see every run and every event in append order, so that I can reconstruct what happened after the fact.
14. As an operator, I want to tell a cleanly terminated run from one whose producer died, so that a stuck run is diagnosable rather than indistinguishable from a slow one.
15. As an operator, I want a run whose producer died to stop being served as though it were still live, so that a dead run does not accumulate clients parked on it forever.
16. As a developer cloning this repo, I want one documented command to bring the database up and one to apply the schema, so that I can reach a working durable run without reverse-engineering the setup.
17. As a developer, I want the application to fail at boot with a clear message when the database connection string is missing or malformed, so that a misconfiguration does not surface as a confusing error on the first chat request.
18. As a developer, I want the schema to arrive as a generated, committed migration, so that the database is reproducible rather than the product of commands somebody once ran.
19. As a developer saving files in dev, I want repeated hot reloads not to exhaust the database's connections, so that I can work for an hour without restarting Postgres.
20. As a developer, I want swapping the durability backend to remain a change to one module, so that the seam ticket 03 built keeps paying off.
21. As a developer, I want no module outside the server boundary to be able to reach the database, so that the client bundle cannot acquire a connection string.
22. As a developer reading the endpoint, I want it to remain ignorant of which backend is behind the log, so that the route stays a statement of the durable-run contract and nothing else.
23. As a developer, I want the cursor in the log to be the same identifier the client sends back, so that there is exactly one notion of position and no translation layer to get wrong.
24. As a developer, I want a rejoin that names only a position to still resolve which run it means, so that the endpoint contract established in ticket 04 continues to hold.
25. As a developer, I want an event log row to hold the event exactly as the library produced it, so that a future library version adding a field does not silently lose data.
26. As a developer, I want the two tables belonging to delivery durability named distinctly from anything belonging to conversation state, so that the two layers stay legible as separate concerns.
27. As a developer, I want the contract divergences from the library's reference backend documented at the point of divergence, so that the next reader does not "fix" them back.
28. As the project owner, I want `CLAUDE.md`'s incorrect instruction about terminal chunks recorded as an override, so that nobody implements a truncating read from it.

## Implementation Decisions

**Seam.** The single seam is the durability store wrapper built in ticket 03: callers hand it a request (and, for a producer, the run they are starting) and receive a `StreamDurability`. Every decision in this spec sits at or below that seam. No new seam is introduced, and the wrapper's two-arity signature does not change — a resumer passes the request alone, a producer also passes its run id, and that distinction is exactly as load-bearing for this backend as it was for the last one. The endpoint above the seam is untouched.

**Infrastructure added.** Local Postgres as a pinned `postgres:17-alpine` container with a named volume and a readiness healthcheck, so the app cannot race the database on startup. A drizzle-kit configuration at the repo root, generated migrations committed to the repo, and three scripts for generate / migrate / inspect. The connection string joins the existing validated environment schema and the committed example environment file; it is parsed once at boot with everything else.

The drizzle-kit configuration is the **one place permitted to read the environment directly** rather than through the validated schema module: that module fails on a missing model-provider key, which has nothing to do with running a migration. Comment it as the deliberate exception it is.

**Connection lifecycle.** One pooled client, constructed once, **cached on the global object**. Vite re-executes modules on every save, so without the cache each hot reload leaks a pool and Postgres refuses connections within minutes. The same applies to the dedicated notification client below. This is an external-resource lifecycle problem, not premature optimisation.

**Schema — two tables, and they belong to this layer alone.** An append-only event table keyed by run, plus a small per-run table carrying whether the log has been terminalised and when the run was first seen. Naming keeps them visibly distinct from the conversation-state tables ticket 10 introduces: the terminalisation flag here is a property of the *delivery log*, whereas a run's lifecycle status is a property of the *run record*, and merging them would couple the two layers the library deliberately separates.

**The cursor is a single database-wide sequence, not a per-run counter.** The library requires only that positions increase within a run — it says so explicitly, and warns against renumbering to make them contiguous. A database-wide sequence satisfies that while removing the per-run counter and its allocation race entirely.

**Offsets encode the run they belong to.** The wire offset is a versioned, opaque string carrying both the run id and the position. This is not decoration: the endpoint contract from ticket 04 permits a rejoin that supplies a position and no run id, so the position must be able to name its own run. Offsets become server-sent-event `id:` lines, so they must be non-empty, contain no carriage return or line feed, and equal their own trimmed form. Mirror the reference backend's scheme rather than inventing a second one.

**The five methods.** The library's reference in-memory backend is the specification; read it alongside the implementation. In particular:

- **Terminalisation is the close call, never a chunk type.** A terminal event does *not* end a read. An agent-loop run emits one per iteration, so stopping at the first would truncate any tool-calling run at its first tool call. Completion is signalled by the producer closing the log, which it does on every exit including cancellation and failure. `CLAUDE.md` §4 instructs the opposite and is wrong; see Further Notes.
- **Never return an empty read while the producer is alive.** An empty read ends the response and reaches the user as a "stream incomplete" error. Park instead.
- **Peek, never create, on read.** No log row plus a concrete position means the run is unknown or expired: fail, and do *not* insert a row. A from-start rejoin may legitimately arrive before the producer, so it may park under a bounded first-event deadline — but if that deadline elapses with nothing stored, fail rather than leaving a phantom behind.
- **Snapshot and read fail differently, on purpose.** A snapshot returns everything stored at the moment of the call, never waits, and must resolve to an empty list for an unknown run. It must **not** reuse read's unknown-run failure path.
- **Append returns one position per event, in input order**, in a single transaction that also ensures the log row exists.
- **Respect the abort signal** so a client that has gone away stops the wait.

The wrapper's declared return type stays the narrow durability interface. The optional upsert capability is deliberately not implemented and must not be leaked, so that no caller can come to depend on a capability a future backend might not have.

**Parking is event-driven, and costs one connection for the whole process.** A single dedicated client — held apart from the pool, cached globally — listens on one channel for the process and dispatches to in-process waiters keyed by run id, with the run id travelling in the notification payload. Structurally this is the reference backend's waiter list, fed by the database instead of by in-process appends, which is precisely what makes it work when the producer is in another process. A channel per run was rejected: it would hold a connection per reader and drag in identifier length and character-set constraints that a payload does not have.

**The wait between events is bounded, diverging from the reference backend.** The in-memory backend bounds only the wait for the *first* event, on the reasoning that once a run has produced anything its producer owns termination. That reasoning does not survive the move to a database: our log outlives its producer, so a process killed mid-run leaves a log that is never terminalised, and a rejoining client would park on it forever with no error. So the wait between events is also bounded, after which the read fails with a message naming the likely cause. Document the divergence and its reasoning where it happens.

Rejected alternative: sweeping unterminated logs at startup. Under hot reload that fires on every save and would terminalise a run that is still streaming.

**Duplication to remove while here.** The endpoint currently hand-copies the library's unexported logic for reading a resume position off a request, because the adapter needs to agree with it and two readings that disagree would reject rejoins the transport would have served. The adapter needs the same logic, so extract it once into the server module and have the endpoint import it, rather than creating a third copy.

## Testing Decisions

This project has no test suite by deliberate decision, and this spec does not introduce one — the library's persistence conformance kit is considered in ticket 10 and also declined. Verification is by running the application, which is the project's stated method.

A good check here observes behaviour at the seam, the way a user or an operator would: a response on the wire, text on the screen, or rows in the database. None of them reach into the adapter's internals.

**Prior art.** Ticket 04 established the pattern that matters most for this ticket: it produced real evidence of the endpoint's contract — the missing-position rejection and the unknown-run failure — **before any UI existed and without a model key**. That pattern applies directly here, and the checks below are ordered to exploit it.

**Verified without a model key** (the run log's hardest rules are reachable this way):

1. A rejoin carrying no position is rejected, as it was before this change.
2. A rejoin naming a run the database has never seen fails promptly and legibly, rather than hanging.
3. A rejoin whose position names a different run than the request does is rejected.
4. A malformed or foreign-format position is rejected rather than being partially parsed.
5. Boot fails with a clear message when the connection string is absent or malformed.
6. The generated migration applies to an empty database, and applies cleanly a second time.

**Verified by running the app against a real key:**

7. Sending a message streams a reply, and the event table fills with one row per event, in order, for that run.
8. The log's terminalisation flag flips when the run ends, and does so for a stopped run and a failed run as well as a completed one.
9. Reloading mid-stream rejoins the same run and the reply finishes — the ticket 06 behaviour, unregressed. The network call on reload names both a position and a run.
10. A rejoin issued while the run is still producing waits and then delivers, rather than returning an empty stream and surfacing as "stream incomplete".
11. **The claim this ticket exists for:** let a run finish, stop the server process, start it again, reload, and confirm the reply is served back out of the database. On the previous backend it was gone.
12. A run interrupted by killing the process mid-stream replays what was captured and then fails with the bounded-wait message, rather than hanging indefinitely. **This is the tier-3 limit being observed, not a feature** — do not present it as takeover.
13. Repeated hot reloads over a working session do not exhaust the database's connections.
14. A production build contains no connection string and no database driver.
15. Lint, typecheck, and build pass.

## Out of Scope

- **Tier 3: taking a live run over after the process that started it died.** That needs a run store, a lock store, fencing epochs, and a run driver, and is a separate project. This ticket must not be demonstrated as reaching it.
- Server-side conversation state — the transcript, run records, interrupts. That is ticket 10; the browser remains the transcript's store after this ticket.
- The optional upsert capability on the durability interface.
- Any change to the endpoint's contract, the run identity schemas, the chat client options, or any component. The user interface is untouched.
- Retention, pruning, or archival of the event log. It grows without bound; that is acceptable for a POC and should be noted rather than solved.
- Multi-instance operation. The design does not prevent it and the notification mechanism is deliberately the one that would survive it, but nothing here is verified beyond a single process.
- Authorization. Run ids and thread ids remain guessable and unauthenticated.
- A test framework, and a durability conformance suite of our own.
- Restoring the run status panel that ticket 08 removed. The tension flagged in ticket 08's Further Notes still stands and is still unresolved.

## Further Notes

**This ticket deliberately reverses a decision recorded in `context.md` §2**, which said no Postgres, Drizzle, or Docker in the bootstrap phase because nothing read them and a half-wired database would muddy the demo. That was correct then and is being reversed now on its own terms: the tables have a reader, and the reason for the deferral has expired. `context.md` §2 asks that such a reversal be raised rather than made silently — this paragraph is that, and the context file is updated to match as part of this ticket.

**`CLAUDE.md` §4 contains an error that would silently corrupt this implementation.** It instructs the read to "stop at a terminal chunk (`RUN_FINISHED` / `RUN_ERROR`)". The library's own source says the opposite in as many words: a terminal event does not end a read, because an agent-loop run emits one per iteration, and stopping at the first would truncate a tool-calling run at its first tool call. Termination is the producer's close call. Implemented as `CLAUDE.md` says, every reasoning-then-answering or tool-calling reply would replay only its first segment on rejoin — and because the POC's model reasons before answering, that failure is reachable today. This is recorded as a fifth entry in `context.md` §4's override list, following the mechanism the four existing entries established; `CLAUDE.md` itself is left as standing law and not edited.

**A known fork in the setup.** Current drizzle-kit reads the environment file itself, in which case nothing extra is needed. If it does not pick up the connection string, add a dotenv dependency and load it at the top of the drizzle-kit configuration. Run the generate script and find out rather than guessing; whichever branch is taken, note it in the completion notes.

**The database driver is Node-only.** Only the server boundary imports it and only the endpoint reaches that, so it should stay out of the client bundle on its own. If the build complains, the fix is Vite's externalisation configuration — do not reach for it pre-emptively, and do check the built client for the driver either way.

**Two smaller notes.** The database-wide sequence used as the cursor is correct here but is a property of a single database; if the event table were ever partitioned or sharded, the offset scheme needs revisiting, so the versioned prefix on the offset format is doing real work and should not be dropped. And the bounded wait between events is a number that will need tuning on a slow model or a slow connection — pick it as a named constant with the reasoning attached, not an inline literal, so the next person adjusts it knowingly.
