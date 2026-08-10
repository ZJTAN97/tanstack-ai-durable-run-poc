# Integrating TanStack AI with Postgres

**Touches:** `src/server/db/`, `src/server/ai/postgres-stream.ts`,
`src/server/ai/append-notifications.ts`, `src/server/ai/chat-persistence.ts`,
`src/server/ai/delivery-log-retention.ts`

## Summary

Postgres is not incidental infrastructure here — it is what makes a run
*durable* rather than merely reconnectable. It plugs in at **two independent
seams**, and the single most important thing to get right is that they stay
independent.

| | Delivery durability | Conversation persistence |
| :-- | :-- | :-- |
| Interface | `StreamDurability` (5 methods) | 4 stores → `ChatPersistence` |
| Wired via | `durability: { adapter }` | `middleware: [withPersistence(p)]` |
| Tables | `delivery_logs`, `delivery_log_events` | `chat_threads`, `chat_messages`, `chat_runs`, `chat_interrupts`, `chat_metadata` |
| Cursor | `bigserial` row id | n/a |
| Lifetime | minutes (a buffer) | the conversation |
| Shared code | **none** | **none** |

Seven tables, two migrations, one pooled client. The hard parts were three:
never returning an empty read (LISTEN/NOTIFY), a cursor scheme that survives on
the wire, and knowing which optional-vs-absent distinction each store contract
actually cares about.

---

## 1. The client — one pool, cached on `globalThis`

```ts
// src/server/db/client.ts
const globalWithPool = globalThis as typeof globalThis & { durableRunPool?: Pool }

const pool = globalWithPool.durableRunPool ?? new Pool({ connectionString: env.DATABASE_URL })
globalWithPool.durableRunPool = pool

export const db = drizzle({ client: pool, schema })
```

Vite re-executes modules on every save. Without the global cache each hot reload
leaks a pool and Postgres refuses connections within minutes. This is
external-resource lifecycle management, not premature optimisation — and the
same trap catches the LISTEN connection in `append-notifications.ts`, and would
catch any `setInterval` you were tempted to add.

Environment is parsed once through Zod at import time, so a misconfigured server
dies at boot with the list of what's wrong rather than on the first chat request
with a provider 401.

## 2. Delivery durability: the run log

### Two tables

```
delivery_logs         run_id PK · started_at · closed_at
delivery_log_events   id bigserial PK · run_id FK (cascade) · chunk jsonb
                      index (run_id, id)
```

`closed_at` is **the terminalisation of the log**, set by the producer's
`close()`. It is deliberately *not* a run status — that belongs to `chat_runs`,
and merging them would couple the two layers the library keeps apart. A log with
`closed_at` still null long after `started_at` is the diagnosable case: its
producer died without closing.

### The cursor is a database-wide sequence

`delivery_log_events.id` is a plain `bigserial`, not a per-run counter. The
library requires only that positions **increase within a run** — it explicitly
warns against renumbering them to be contiguous — so a shared sequence satisfies
the contract while deleting the per-run counter and its allocation race
entirely.

That is a property of *one* database. Partition or shard the table and the scheme
needs revisiting, which is exactly why the wire offset carries a version prefix.

### The wire offset carries both the run and the position

```
pg:v1:<percent-encoded runId>:<position>
```

Every part earns its place:

- **the run id**, because the endpoint contract permits a rejoin that supplies a
  position and no run id;
- **the version prefix**, so an offset minted under a scheme that has since
  changed is *rejected* rather than misread;
- **percent-encoding**, because offsets become SSE `id:` lines and so must be
  non-empty, carry no CR/LF, and equal their own trimmed form.

Two positions name no run and are handled specially: `-1` (from start) and `now`
(from tail).

When a request supplies both an offset and a run id and they disagree, **fail
loudly**. Served from the offset alone it would look like it had worked.

### `append` — one transaction, notify inside it

```ts
append: async (chunks) => db.transaction(async (tx) => {
  await tx.insert(deliveryLogs).values({ runId }).onConflictDoNothing()

  const inserted = await tx.insert(deliveryLogEvents)
    .values(chunks.map((chunk) => ({ runId, chunk: withoutAccumulatedContent(chunk) })))
    .returning({ id: deliveryLogEvents.id })

  await notifyAppend(tx, runId)          // ← inside, so the wake lands on commit
  return inserted.map((e) => encodeOffset(runId, e.id))
})
```

Three decisions:

- **The log row and its events land together**, so an event can never exist for a
  run the log table has never heard of.
- **`pg_notify` runs inside the transaction**, so the wake is delivered on commit
  — never before the rows it announces are visible to the reader it wakes.
- **Chunks are stored verbatim, with exactly one measured exception.**
  `withoutAccumulatedContent` strips `TEXT_MESSAGE_CONTENT`'s `content` mirror
  when a rebuilding `delta` is present. Without it a run costs
  `O(reply length²)` — 3.2k characters produced 421 kB. Full workings in
  [delivery-log-grows-quadratically-in-reply-length.md](./delivery-log-grows-quadratically-in-reply-length.md).

### `read` — the hard one

The rule that matters: **never return empty while the producer is alive.** An
empty read ends the response and reaches the user as *"stream incomplete"*. Park
instead.

```ts
read: async function* (offset, signal) {
  // Peek, never create. A concrete position for a run with no log means the run
  // is unknown — inserting a row here would be a phantom log nothing reclaims.
  const log = await readLogState(runId)
  if (log === undefined && !isFromStartJoin) throw new Error(`Unknown run log: …`)

  let position = /* 0 | tail | decoded.position */

  await ensureAppendListener()          // awaited: a reader that can't hear appends must fail, not stall
  const watcher = watchRun(runId)       // registered BEFORE the first query

  try {
    for (;;) {
      const state = await readLogState(runId)          // state BEFORE events…
      const events = await readEventsAfter(runId, position)

      for (const event of events) { position = event.id; yield { offset: encodeOffset(runId, event.id), chunk: event.chunk } }

      if (state?.closedAt != null || signal?.aborted) return

      await watcher.wait(position > 0 ? producerSilenceBound : firstEventBound)
    }
  } finally { watcher.dispose() }
}
```

Five subtleties, each of which cost time:

1. **Read the log's state *before* its events.** If it reads closed at that
   moment, the events fetched next are necessarily the complete set. The other
   order can drop a final chunk.
2. **Register the watcher before the first query**, so an append landing between
   the query and the park is not missed.
3. **`ensureAppendListener()` is awaited, not fired and forgotten.** A tailing
   read that cannot learn about appends should fail with a reason, not quietly
   wait out its deadline.
4. **Do not stop at the first terminal chunk.** An agent-loop run emits
   `RUN_FINISHED` per iteration, so stopping there truncates a tool-calling run at
   its first tool call. `close()` is the only terminalisation.
5. **Two different deadlines, because they mean different things.** A from-start
   join waiting for a run's very first event (1s — an empty log means the run is
   gone, and failing fast re-enables the composer) is not the same as a caught-up
   reader waiting mid-run (45s — tune against the slowest gap a healthy run can
   produce: a slow first token, a long tool call). The timeout *message* is
   supplied by the caller for exactly that reason.

The mid-run bound is a **deliberate divergence from `memoryStream`**, which
bounds only the first wait on the reasoning that a started run's producer owns
termination. That reasoning does not survive the move to a database: this log
outlives its producer, so a killed process leaves a log that is never
terminalised and a rejoining client would park forever. (Sweeping unterminated
logs at startup was rejected — under hot reload that fires on every save and
would terminalise a run that is still streaming.)

### LISTEN/NOTIFY: one channel, run id in the payload

```ts
const APPEND_CHANNEL = 'delivery_log_append'
// writer: select pg_notify('delivery_log_append', $runId)
// reader: LISTEN delivery_log_append  →  wake the waiters registered for that run
```

Structurally this is `memoryStream`'s in-process waiter list, fed by the database
instead of by in-process appends — which is precisely what makes it work when
the producer is in another process.

A channel per run was rejected: it holds one connection per parked reader, and
drags in Postgres' identifier length and character-set constraints, which a
payload does not have.

The listener connection is a **separate `pg.Client`**, not a pooled one — a
connection running `LISTEN` cannot be handed back to the pool. It is cached on
`globalThis` alongside the waiter registry, so a read parked across a hot reload
is still woken by the new module's notifications. On `error` or `end` the cache
is cleared **and every waiter is woken**, so they re-query and re-park through
the reconnect rather than sitting on a connection that will never deliver again.

### Retention

A log is a buffer, so expiry is part of its definition, not a later feature. One
`DELETE` against `delivery_logs`, letting the cascade take the events; two
predicates because there are two ways for a log to be finished. Triggered
opportunistically and unawaited from POST. Reasoning in
[a-delivery-log-is-a-buffer-not-a-record.md](./a-delivery-log-is-a-buffer-not-a-record.md).

## 3. Conversation persistence: the transcript

### Storing messages

```ts
chat_messages: id bigserial PK · thread_id FK(cascade) · position int
             · role text · message_id text · message jsonb · created_at
             unique (thread_id, position)
```

**Store the message whole; project beside it only what you need to query.** A
message's content is a union of a string, null, and a list of parts from a wide,
provider-extensible set. Decomposing into columns loses a field the moment the
library adds one, and has to reconstruct stored-null vs absent on the way out.
Storing it whole makes the round-trip exact by construction.

`position` is explicit, not implied by insertion order: `saveThread` rewrites a
thread's rows on every turn, so insert order isn't stable, and two messages of
one turn can share a millisecond.

`message_id` (the library's, optional) and `id` (ours, always present) are
different identifiers with different lifetimes. Neither substitutes for the
other.

### A save is a full overwrite

`saveThread(threadId, messages)` receives the complete authoritative transcript
with no diff information. So: upsert the thread, delete its messages, reinsert —
**in one transaction**, because a thread holding half a conversation must never
be observable.

`loadThread` returns `[]` for an unknown thread, never `null`.

### The run store's `in`-vs-`!== undefined` trap

This one is genuinely easy to get wrong and produces a run that looks
permanently detached:

```ts
if (patch.status !== undefined) set.status = patch.status          // value fields
…
if ('detachedSince' in patch) set.detachedSince = patch.detachedSince ?? null   // clearable fields
if ('cancelRequested' in patch) set.cancelRequested = patch.cancelRequested ?? null
```

A reattach **clears** `detachedSince` by passing it explicitly as `undefined`.
`!== undefined` cannot tell *"clear this"* from *"did not mention this"*, so it
drops the clear. Four columns need presence-testing: `sandboxKey`,
`detachedSince`, `cancelRequested`, `driverEpoch`. `cancelRequested` reasons the
same way for a different reason — `false` is a meaningful value, not "unset".

Other contract obligations worth stating:

- `createOrResume` is **idempotent** — an existing `runId` is returned untouched,
  so a resume or a double submit cannot clobber recorded state. Re-read after the
  `onConflictDoNothing` rather than trusting the insert: a concurrent call may
  have won the race, and that row is the authoritative one.
- `update` on an unknown `runId` is a **no-op** — neither throw nor insert.
- Records **omit absent optionals** rather than materialising them as `null`, so
  they compare cleanly against the library's reference in-memory backend. Hence
  the `...(row.x !== null ? { x: row.x } : {})` spread pattern in the mappers.
- `error` / `errorCode` are one `RunError` split in two, and always move together
  — otherwise a later code-less failure leaves a stale code behind.

### Timestamps disagree, on purpose

`chat_runs` uses `bigint` epoch milliseconds because the store contract speaks in
them. The delivery tables use `timestamptz` because nothing external constrains
them and `now()` in a retention query is cleaner. Different layers, different
conventions, and neither is wrong.

### Metadata: two columns, not one delimited key

`(namespace, key)` is a composite primary key. A `${namespace}:${key}` string
collides the moment either part contains a colon. And guard the JSON write —
`null` binds as SQL NULL and the NOT NULL column rejects it with an opaque driver
error, so say what's wrong instead and point at `delete()`.

### Indexes follow the contract's queries

```
chat_runs_status_detached_idx (status, detached_since)   → listReclaimable
chat_runs_thread_started_idx  (thread_id, started_at)    → findActiveRun, listByThread
delivery_log_events (run_id, id)                         → readEventsAfter
```

`findActiveRun` is the hot one — every page load calls it through
`reconstructChat`.

## 4. Drizzle-specific notes

- **`$type<T>()` is how library types reach the schema**: `jsonb('chunk').$type<StreamChunk>()`,
  `text('status').$type<RunStatus>()`. The column carries the library's type
  without a hand-written mirror.
- **Drizzle owns persistence types** (`$inferSelect` / `$inferInsert`), **Zod owns
  the network boundary.** A row is not automatically a valid API payload — the
  mappers between them are explicit for that reason.
- **Migrations are generated, committed, applied.** `pnpm db:generate` then
  `pnpm db:migrate`. Not `push`, which skips history and makes the schema
  unreproducible.
- **Raw SQL only where Drizzle can't express it**, via the `sql` tag:
  `sql`select pg_notify(${channel}, ${runId})``,
  `sql`coalesce(${deliveryLogs.closedAt}, now())`` (first close wins),
  `sql`now() - make_interval(secs => ${seconds})``.

## Transferable lessons

- **Two persistence layers that answer different questions should share no code.**
  The temptation to merge `delivery_logs.closed_at` into `chat_runs.status` is
  constant and wrong: it couples layers the library deliberately keeps apart.
- **A blocking read over a database needs a wake channel *and* a bound.** The
  channel stops it spinning; the bound stops an orphaned log hanging a client
  forever. In-memory reference implementations need only the first, so this is
  exactly where a port must diverge from its spec.
- **Notify inside the transaction.** Outside it, you can wake a reader before the
  rows it's being woken for are visible.
- **Read the "is it finished?" flag before the data, not after.** Ordering is the
  whole difference between a complete replay and a dropped final chunk.
- **`'key' in patch` and `patch.key !== undefined` are different questions.** Any
  store contract with clearable fields will punish you for conflating them.
- **Store provider-extensible payloads whole.** Column-per-field loses data on the
  next library release; the exceptions should be measured, guarded, and written
  down where the next reader will look.
- **Cache every long-lived external resource on `globalThis` under Vite.** Pools,
  LISTEN connections, timers — HMR re-executes the module and leaks one per save.
