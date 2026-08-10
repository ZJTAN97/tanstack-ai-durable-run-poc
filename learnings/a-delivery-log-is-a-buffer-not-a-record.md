# A delivery log is a buffer, not a record — so retention is part of its design

**Date:** 2026-08-10
**Touches:** `src/server/ai/delivery-log-retention.ts`, `src/server/ai/stream-store.ts`, `src/routes/api.chat.ts`

## The mistake this corrects

`delivery_log_events` shipped with the comment *"The log grows without bound.
Retention is out of scope for the POC."* Treating expiry as a deferred feature
was the error. A buffer with no expiry isn't an unfinished optimisation — it is a
missing property of the thing.

## The distinction that resolves it

Two tables in this project hold what looks like the same conversation, and
conflating them is what makes retention feel dangerous:

| | `chat_messages` | `delivery_log_events` |
| --- | --- | --- |
| Answers | what was **said** | what was **streamed** |
| Shape | one row per message | one row per token-ish chunk |
| Lifetime | as long as the conversation | as long as a client might still be catching up |
| Deleting it loses | the conversation | nothing |

The delivery log exists for exactly one job: a client that dropped mid-stream
reconnects and collects the chunks it missed. Once the run has terminalised and
its transcript is saved, every row is dead weight. That is why resumable-stream
implementations typically lean on a TTL-bearing store — expiry is the default
there, not a feature someone remembered to add.

The caveat worth stating: teams *do* often keep a chunk-level event log
long-term, for eval replay, latency forensics, debugging a strange generation.
That is a different table, with a different owner, off the hot path. Don't let
that use case argue against expiring the transport buffer.

## The design

One statement, deleting log rows and letting the existing
`onDelete: 'cascade'` take their events — so the cursor scheme and the events are
reclaimed by one rule rather than two competing ones.

```sql
DELETE FROM delivery_logs
WHERE closed_at < now() - <retention>          -- terminalised cleanly
   OR (closed_at IS NULL
       AND started_at < now() - <abandoned>)   -- producer died without close()
```

**Two predicates, because there are two ways for a log to be finished** — closed
by its producer's `close()`, or orphaned by a producer that died. They are
separate claims on separate clocks: one about how long a *finished* reply stays
fetchable, one about how long to wait before calling a silent producer dead. The
first predicate needs no null guard, because a null `closed_at` cannot satisfy the
comparison and falls through to the second.

**The abandoned window is derived, not chosen.** It is
`PRODUCER_SILENCE_TIMEOUT_MS × 20`. An unclosed log is either mid-stream or
orphaned, and only time distinguishes them — so the safe floor is the moment a
reader would itself have given up waiting. Below that floor the sweep could
delete a log a live reader is parked on. Deriving it from the reader's own
patience makes the constraint structural; a hand-picked constant with a comment
would drift the moment someone tuned the timeout.

**Trigger: opportunistically from POST, unawaited.** Not a timer — Vite
re-executes modules on every save and would leak one per edit, the same
lifecycle trap the DB pool already works around. Not awaited — housekeeping must
never delay a reply, and never fail one; a swallowed sweep costs disk, a thrown
one costs the user their answer. A POST is the only moment the server is
reliably awake and about to grow the log anyway.

**Reclamation goes through the same seam as the log.** Whether expiry means a
`DELETE`, a key TTL, or a dropped partition is the backend's business, exactly as
the log itself is — so `stream-store.ts` wraps it and the endpoint never names
Postgres to do its own housekeeping.

## Verified

A sweep reclaimed 1,111 events across 2 logs via the cascade; a run inside its
window still replayed in full over `GET ?offset=-1`.

## What retention costs, stated honestly

Before this, a rejoin always worked. Now a client that was away longer than the
window and returns with a stale run pointer gets `Unknown run log` surfaced as an
error, where it previously replayed. That is a real regression in one narrow
case, and the right fix is not a longer window — it is to fall back to the
server-side transcript for a finished run, which should never have been the
delivery log's job. Left undone deliberately; recorded so it isn't rediscovered
as a mystery bug.

## Transferable lessons

- **Ask what a table is the record *of*.** If the answer is "nothing — something
  else already holds that", it is a buffer, and a buffer's expiry is part of its
  definition.
- **"Retention is out of scope" is a design decision disguised as a TODO.** It is
  fine to defer, but write down what makes deletion *safe*, or the next person
  cannot tell a buffer from an archive.
- **Derive a safety window from the constant it must not violate.** A derived
  bound cannot drift out of sync with the thing it depends on; a documented
  magic number can and will.
- **Cascade from the parent, don't sweep the child.** Deleting by run keeps one
  rule; deleting events by age would race the cursor scheme and orphan log rows.
- **Name the failure mode a cleanup introduces.** Retention is not free, and the
  case it breaks should be in writing before someone hits it in a demo.
