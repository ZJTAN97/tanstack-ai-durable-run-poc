# 10 — Server-side chat state: the transcript in Postgres, one row per message

**Blocked by:** 09 — it lands the container, pooled client, drizzle-kit config,
migration flow, and `DATABASE_URL` that this ticket reuses. Do not duplicate any
of them.

**Status:** ready-for-agent

**Read first:** `context.md` §2's partial-reversal note (the browser stays
authoritative here, and why the flip is deferred) and §3's "Chat state is a second
package, and it owns no tables".

## Problem Statement

The conversation exists in exactly one place: the browser's local storage, as a single blob per thread. Everything follows from that.

From the user's side:

- Clearing browser data, using private browsing, or switching browsers loses every conversation. There is no copy anywhere.
- Opening the same conversation on a phone shows nothing, even though the address bar identifies the conversation and the server has served every token of it.
- A second tab is unclaimable and stays unclaimed. Both tabs read the same shared storage, find the same resume pointer, and tail one run through two uncoordinated connections. It appears to work, by accident.
- Storage is finite and silent. A long enough history eventually fails to save, and the failure is best-effort by design, so the user is not told.

From the owner's side, the gap is larger:

- There is no record of any conversation on the server. The transcript is streamed, delivered, and forgotten. Only the event log from ticket 09 survives, and that is a delivery log — a sequence of stream events, not messages — so answering "what did people ask" means replaying and reassembling raw events rather than reading a table.
- Nothing can be attached to a message. Thumbs up, an evaluation score, a citation, a moderation flag, a token cost — all of them need a message to point at, and no message has an identity the server knows.
- There is no record of a run's lifecycle: whether it completed, failed, or was aborted, how long it took, or what it cost. Ticket 09's log says whether the delivery log was closed, which is a different question.
- There is nothing to build human-in-the-loop tool approval on. An approval that does not outlive the page cannot gate anything.

## Solution

Give the server its own copy of the conversation, in Postgres, one row per message.

The chat endpoint gains persistence middleware from the library's persistence package, backed by an adapter written against the project's existing database client and schema. From then on, every turn writes the transcript to the database as it completes: one row per message, ordered, with the message stored intact and the fields worth querying projected alongside it. Run records gain a real lifecycle — started, finished, failed, aborted, with timing and token usage. Interrupts and namespaced metadata get their tables at the same time, because the contracts come as a set and half of one is worse than none.

The owner can then ask ordinary questions in SQL: every message in a thread in order, every assistant turn in a time window, every run that failed. Each message is a row that other tables can point at.

**What this ticket does not change, stated plainly.** The browser remains authoritative. The client keeps sending its full transcript and the server mirrors it. A user who clears local storage still sees an empty page, because nothing yet hydrates the client from the server. That flip — server-authoritative history, and with it multi-device and the second tab — is deliberately deferred; see Out of Scope and Further Notes for why it is a separate ticket rather than an afterthought here.

## User Stories

1. As a user, I want my conversation to behave exactly as it does today, so that gaining a server-side copy costs me nothing I already had.
2. As a user, I want a reply to keep streaming at the same speed, so that persistence does not make the app feel slower.
3. As a user, I want a failure to write history never to lose me the reply I am reading, so that a database problem degrades rather than destroys the turn.
4. As a user who reloads mid-stream, I want the reply to carry on to completion, so that the durability behaviour from tickets 06 and 09 survives this change.
5. As a user, I want a reply I stopped to be recorded as far as it got, so that stopping does not discard what was already useful.
6. As a user, I want a reply that reasoned before answering to be stored with that reasoning intact, so that nothing about the turn is silently dropped.
7. As a user, I want a reply that called a tool to be stored with its calls and results, so that the turn is recoverable in full rather than as prose only.
8. As a user, I want starting a new conversation to leave my previous one intact, so that a clean slate is not a deletion.
9. As the POC's reviewer, I want to close the browser entirely, restart the server, and find the conversation still in the database, so that the server's copy is demonstrably independent of the browser's.
10. As the POC's reviewer, I want to clear local storage and confirm the database still holds the transcript, so that the two copies are visibly separate stores.
11. As the POC's reviewer, I want it stated plainly that the page will look empty after that, so that the ticket is not mistaken for delivering multi-device.
12. As an operator, I want every message in a thread readable in order with one query, so that reading a conversation does not require reassembling stream events.
13. As an operator, I want to filter messages by role and by time with ordinary SQL, so that I can answer questions about usage without writing a replay tool.
14. As an operator, I want each message to be a row with a stable identity, so that feedback, evaluation scores, citations, and cost attribution have something to point at later.
15. As an operator, I want a message stored losslessly, so that a library version adding a field does not silently discard it.
16. As an operator, I want to inspect a conversation in the database browser and have it be legible, so that debugging a turn does not start with decoding a blob.
17. As an operator, I want a run's outcome recorded — completed, failed, or aborted — so that I can tell a successful conversation from one that broke.
18. As an operator, I want a run's timing and token usage recorded, so that I can attribute cost and latency to a specific turn.
19. As an operator, I want a still-running run for a thread to be findable, so that the machinery a later takeover feature needs is already in place.
20. As an operator, I want deleting a thread to remove its messages with it, so that removal is one action rather than a cleanup script.
21. As a developer, I want the persistence adapter to be one module built on the existing database client, so that there is no second connection pool and no parallel migration history.
22. As a developer, I want the four tables added to the existing schema and shipped as a generated, committed migration, so that the database stays reproducible.
23. As a developer, I want persistence attached to the endpoint as middleware and nothing else in the endpoint to change, so that delivery durability and conversation state remain visibly separate layers.
24. As a developer, I want the adapter to honour the contracts' insert-if-absent rules, so that a resume or a double submit cannot clobber recorded state.
25. As a developer, I want a repeated interrupt never to reset a resolved one back to pending, so that an approval already answered stays answered.
26. As a developer, I want a run patch to be able to *clear* a field as distinct from not mentioning it, so that a future reattach can un-detach a run rather than leaving it permanently detached.
27. As a developer, I want records to come back out shaped exactly as they went in, with absent optional fields still absent, so that the adapter matches the library's reference behaviour.
28. As a developer, I want saving a transcript to be atomic, so that a failure mid-write cannot leave a thread holding half a conversation.
29. As a developer, I want the persistence factory typed as the full chat persistence shape, so that a missing store is a compile error rather than a runtime rejection.
30. As a developer, I want the message rows to remain queryable without me hand-mapping every field of a message into its own column, so that the schema does not need revising each time the library grows a field.
31. As the project owner, I want the deferral of server-authoritative history recorded with its reasons, so that the next ticket starts from a decision rather than a rediscovery.

## Implementation Decisions

**Seam.** The single seam is the persistence adapter module: the endpoint imports one value and hands it to the middleware. Everything in this spec sits at or below that seam. This mirrors ticket 09's shape deliberately — both layers reach the database through exactly one module that the endpoint names and knows nothing about the inside of.

**Package.** The library's persistence package is added as a dependency. It ships the store contracts, the middleware that drives them, an in-memory reference backend, and a conformance kit; it ships **no tables and no migrations**. The schema is entirely ours. Note that the package pins the core AI library to an exact version, so any future core bump becomes a coordinated upgrade of both.

**Schema — five tables, added to the existing schema directory, named apart from ticket 09's delivery tables.** A thread table as the parent record; a message table, one row per message; and the three contract tables for run records, interrupts, and namespaced metadata. The run record's structured error becomes two columns — prose and a stable code — that always move together, so a later code-less failure cannot leave a stale code from an earlier one behind. Take the two indexes the library's own recipe specifies: one supporting the query for reclaimable runs, one supporting find-active-run and list-by-thread.

**Messages are one row each, and the message itself is stored whole.** This is the decision with the most consequence, so both halves of it matter:

- **One row per message**, with an explicit ordering column and a uniqueness constraint on thread-and-position. This is what buys every operator story above, and it is the shape production chat systems converge on. An ordering column is required rather than relying on insertion order or a timestamp: the save path rewrites a thread's rows, and two messages in one turn can share a millisecond.
- **The message body is stored as one JSON column, with the fields worth querying projected alongside it** — role, the message's own optional id, position, and a creation timestamp. It is *not* decomposed into a column per field. A message's content is a union of a string, null, and a list of parts drawn from a wide, provider-extensible set. Decomposing it means reconstructing that union on the way out, which loses fields the moment the library adds one, and means threading the difference between a stored null and an absent value correctly — content is required and may legitimately be null, while several sibling fields must be absent when unset. Storing the message whole makes the round-trip exact by construction and deletes that entire class of bug, while the projected columns preserve every query actually named in the user stories. Reach into the JSON for anything deeper.

**The save path is a full overwrite, atomically.** The contract is explicit that a save replaces a thread's transcript rather than appending to it — the argument is the complete authoritative history. So a save is one transaction: upsert the thread record, delete the thread's message rows, insert the new set with positions assigned by order. A partial write must not be observable, hence the transaction. Loading an unknown thread returns an empty list, never null.

**The contracts' idempotency rules are the substance of the adapter, not incidental detail.** Follow the library's recipe precisely on each:

- Creating-or-resuming a run is insert-if-absent, and must **re-read** rather than trust the insert, because a concurrent call may have won the race and that row is the authoritative one.
- Patching an unknown run is a silent no-op — it must neither throw nor insert.
- A run patch distinguishes "clear this field" from "did not mention this field" by testing for the key's *presence*, not for an undefined value. Testing for undefined cannot tell the two apart and would silently drop a clear.
- Creating an interrupt is insert-if-absent, so a duplicate can never reset a resolved interrupt back to pending.
- Storing a null metadata value is an error with a clear message rather than an opaque driver failure; clearing is a delete.

**Absent optionals must stay absent** on the way out. The library's reference backend stores records verbatim, and its conformance kit compares against that, so an adapter that materialises an absent optional as a present null diverges from the contract even though no test in this repo will catch it.

**Typing.** The factory is annotated with the full chat-persistence shape, not the library's unparameterised all-optional bag — the middleware rejects the latter because the message store is possibly undefined. Row types come from the schema's own inference; the network boundary keeps its Zod schemas. A row is not an API payload and the two must not be conflated.

**Endpoint change is one line.** The middleware is attached to the chat call. Nothing else in the endpoint changes — not the request schemas, not the resume handler, not the durability wiring. The two layers share no code and stack cleanly.

**The client is unchanged, and stays browser-authoritative.** The client keeps its local-storage persistence and keeps posting its full transcript, which the contract defines as the client asserting authority: the server overwrites its stored copy with what it receives. This is a deliberate stopping point, for two concrete reasons rather than to keep the change small:

1. Server-authoritative operation requires a hydrate route, and the endpoint's existing GET is already the resume handler. Two unrelated jobs on one verb wants a separate route, which is its own decision.
2. Server-authoritative clients post an **empty** message list to mean "continue from your copy", and the request schema currently requires at least one message. That constraint would have to be relaxed, and relaxing it removes the guard that makes a malformed request obvious.

**Never post a delta as the message list.** The contract reads a non-empty list as the complete transcript and overwrites with it, so sending a delta would truncate the stored thread down to that delta. The client already sends full history; this is recorded so a future optimisation does not quietly break it.

## Testing Decisions

This project has no test suite by deliberate decision, and this spec does not introduce one. Verification is by running the application.

This is the one ticket where that decision has a real cost, and it should be recorded rather than glossed. The persistence package ships a conformance kit that would exercise all four stores against the reference backend, including the insert-if-absent and absent-optional rules above, for a handful of lines. It was considered and **declined**, because it requires a test framework the project has ruled out. The consequence is that the idempotency rules are verified by inspection and by targeted manual exercise, not by a gate. If the adapter ever misbehaves in a way the checks below do not catch, running that kit is the first thing to try.

A good check here observes what an operator or user could observe: rows in the database, or behaviour on screen. None inspect the adapter's internals.

**Prior art.** Ticket 09 established database-level verification through the schema inspector, and ticket 04 established key-free contract checks at the endpoint. Both apply.

**Verified without a model key:**

1. The generated migration applies to a database already carrying ticket 09's tables, and applies cleanly a second time.
2. Deleting a thread row removes its message rows with it.
3. Boot still fails legibly on a missing or malformed connection string.

**Verified by running the app against a real key:**

4. Sending a message and receiving a reply produces one row per message, in order, with positions contiguous from the start of the thread.
5. A second turn in the same thread leaves the thread holding the whole conversation, not just the latest turn — the check that catches a delta being posted or an append being mistaken for an overwrite.
6. Every message round-trips: reading a stored message back gives exactly what was sent, including a reply that reasoned before answering and one that is stored with null content.
7. The run record moves to a terminal outcome with timing, and token usage is recorded where the provider reports it.
8. A stopped reply is recorded as far as it got, and its run record reflects being aborted rather than completed.
9. A failed reply leaves a run record marked failed rather than left running.
10. Querying by role and by time returns what it should, using the projected columns rather than reaching into the JSON.
11. **The claim this ticket exists for:** close the browser, restart the server, and read the conversation out of the database.
12. Clear local storage and confirm the database still holds the transcript. The page will paint empty; that is expected and is exactly the deferral this ticket documents.
13. Reloading mid-stream still rejoins and finishes the reply — tickets 06 and 09, unregressed.
14. Starting a new conversation leaves the previous thread's rows intact.
15. Repeated hot reloads do not exhaust the database's connections.
16. Lint, typecheck, and build pass, and the built client contains no connection string.

## Out of Scope

- **Server-authoritative history, and therefore multi-device and the second tab.** Requires a hydrate route and relaxing the request schema's minimum message count. Deferred to a follow-up ticket; the browser stays authoritative here.
- Hydrating the client from the server on mount, and the reconstruct helper that would do it.
- A conversation list, a thread switcher, or any UI that reads the server's copy. No component changes in this ticket.
- Tools, tool approval, and human-in-the-loop flows. The interrupt table is created because the contracts come as a set, but no tool is defined and no approval is wired.
- Streaming partial-assistant snapshots. The library offers it as an option; finish remains authoritative and the extra writes are not justified here.
- The generation-side contracts — generation runs, artifacts, and byte storage. Chat only.
- Locks and multi-instance coordination.
- Tier 3 run takeover. The run record carries the fields a takeover would need, which is a side effect of following the contract, not a claim to implement it.
- Authorization. Thread ids remain guessable and unauthenticated, and both the library's own guidance and the reconstruct helper warn that a multi-user deployment must authorize at the route boundary. Recorded, not solved.
- Retention, redaction, and pruning. Per-message granularity makes them possible later, which is part of the point, but none is built.
- A test framework, and therefore the conformance kit — see Testing Decisions.

## Further Notes

**The deferral in this ticket is the interesting part, and it should not be allowed to drift.** After this lands, the server holds a complete, queryable copy of every conversation that nothing reads back. That is a coherent stopping point — it delivers every operator story and no user story beyond not regressing — but it is also the kind of state that quietly becomes permanent. The follow-up is small and well-understood: a hydrate route separate from the resume handler, the request schema's minimum relaxed, and the client's local-storage persistence swapped for the server-authoritative mode. It should be written up as ticket 11 rather than left as a paragraph here.

**One consequence worth stating in advance.** Once the server is authoritative, the second-tab case that `context.md` §1 explicitly dropped from the claim becomes addressable — but it does not become *addressed*. Two tabs would still tail one run through two connections; what changes is that the transcript stops being the shared mutable thing they fight over. Do not let ticket 11 be read as closing the second-tab question.

**On the schema decision, since it will be revisited.** The choice to store a message whole while projecting a few columns is a middle position, and it will look like a compromise to someone who wants either extreme. It is chosen because the two extremes each fail on a specific, checkable ground: a single blob per thread cannot answer any of the operator stories, and a fully decomposed message cannot survive the library adding a field to a content part. If a future reader wants to decompose further, the thing to check first is whether the content-part union has stabilised — not whether the queries would be tidier.

**Two smaller notes.** The message table's own primary key and the message's optional library-assigned id are different identifiers with different lifetimes: the row key is ours and stable, the library's id is optional and may be absent, and the two must not be conflated — in particular the row key is not a substitute for the library's id when a message is written back. And the save path's delete-then-insert rewrites a thread's rows on every turn, which is acceptable at POC conversation lengths but is quadratic in writes over a long thread; the linear alternative is diffing against stored rows, which needs a stable per-message key, which is exactly what the library's optional id is not guaranteed to provide. If thread lengths ever make this matter, verify that the id survives the client round-trip before relying on it.
