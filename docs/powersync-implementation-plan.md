# Implementation plan: PowerSync + TanStack DB

Adds a second delivery channel to this POC. The existing durable-run stack is **not** modified.

Read first: [`CONTEXT.md`](../CONTEXT.md) for the language, [`adr/0001`](./adr/0001-stream-and-sync-are-separate-channels.md) for why the transcript is not synced, [`adr/0002`](./adr/0002-threads-carry-tenancy-runs-do-not.md) for why only threads carry an owner.

---

## Settled decisions

These were argued out. Do not relitigate them; if one turns out to be wrong in execution, say so and stop rather than quietly substituting another.

| # | Decision |
|---|---|
| 1 | **Sync carries `chat_threads` and `chat_runs`. Nothing else.** The transcript stays with `useChat` over HTTP; the delivery log is never replicated. |
| 2 | **The client writes through PowerSync**, not through server functions. `chat_runs` is read-only on the client, enforced server-side. |
| 3 | **`title` is user-owned.** The server never derives or overwrites it. Null renders as "Untitled" in the UI — that is a display fallback, not a stored value. |
| 4 | **PowerSync's `id` requirement is met by aliasing in the sync rules** (`thread_id AS id`, `run_id AS id`). No surrogate keys, no migration to the primary keys. |
| 5 | **The SQLite mirror is hand-written** in `src/lib/powersync/schema.ts` — `DrizzleAppSchema` consumes `drizzle-orm/sqlite-core` tables, so deriving from the `pgTable` definitions is not possible. A build-time guard covers the drift. |
| 6 | **SPA mode.** `@powersync/web` is imported normally as a module singleton. No SSR guards anywhere. |
| 7 | **Self-hosted PowerSync service** in `docker-compose.yml`, with a real token endpoint (not development tokens), shaped so Clerk drops in later at `fetchCredentials` alone. |
| 8 | **"New chat" inserts a Thread row locally**, before anything is said. Empty threads are threads and are not visually distinguished. |
| 9 | **Collections parse rows with Zod** via the collection's own `schema` / `deserializationSchema` slots. Fields stay `snake_case`. |
| 10 | **Runs surface in two places**: a "generating" badge in the thread list (running only), and final status / error / token usage in the chat header. |

## Do not touch

`src/routes/api.chat.ts`, `src/server/ai/stream-store.ts`, `src/server/ai/append-notifications.ts`, `src/server/ai/delivery-log-lifetimes.ts`, the `chat_messages` / `delivery_logs` / `delivery_log_events` tables, and `useChat`'s wiring. That these survive untouched is one of the POC's findings — preserve it.

`chat_interrupts` and `chat_metadata` are out of scope. Do not sync them, do not extend them.

---

## Phase 0 — Infrastructure

PowerSync is a separate service that tails Postgres logical replication. It is not a library added to the app server.

1. **Postgres**: add `command: ['postgres', '-c', 'wal_level=logical']` to the `postgres` service. Keep the existing healthcheck.
2. **PowerSync service**: add a `journeyapps/powersync-service` container. It needs a config file and a sync-rules file mounted in, its own port published, and `depends_on` Postgres with `condition: service_healthy`.
3. **Replication grants and publication**: a publication named `powersync` covering **only** `chat_threads` and `chat_runs`. Set `REPLICA IDENTITY FULL` on both.

   This is DDL that `drizzle-kit generate` will not produce. Use `pnpm db:generate --custom` to get an empty, numbered migration file and write the SQL into it. Do **not** hand-edit an existing generated migration, and do not use `drizzle-kit push`.
4. **`src/server/env.ts`**: add the JWT signing secret (min length enforced) and the PowerSync service URL. Both required, no defaults — a missing secret must kill the server at boot, as the existing schema does for everything else. Add both to `.env.example` with dummy values.

**Verify against the PowerSync self-hosting docs before writing YAML.** The service config keys, the shape of inline JWKS for an HS256 shared secret (`kty: oct`), and the sync-rules schema are all version-sensitive and must not be guessed. If the docs and this plan disagree, the docs win — note the divergence in your report.

**Done when:** `docker compose up -d` brings up both services healthy, and the PowerSync container's logs show it connected to Postgres and parsed the sync rules without error.

---

## Phase 1 — Sync rules

One file, mounted into the service.

- **Parameter query** resolves the requesting user's threads: select `thread_id` from `chat_threads` where `user_id` matches the JWT subject. One bucket per thread.
- **Data queries**, both keyed on the bucket's `thread_id`:
  - `chat_threads` → `thread_id AS id`, `title`, `updated_at`
  - `chat_runs` → `run_id AS id`, `thread_id`, `status`, `started_at`, `finished_at`, `error`, `usage`

Select columns explicitly. Do not `SELECT *` — `sandbox_key`, `detached_since`, `cancel_requested` and `driver_epoch` are reclaim machinery with no reader on the client, and a narrower bucket is less traffic per run.

**Done when:** the service accepts the rules on boot.

---

## Phase 2 — Postgres schema and persistence

1. **Migration**: `chat_threads.user_id text not null default 'anonymous'`. Generate it with `pnpm db:generate`, apply with `pnpm db:migrate`.
2. **`src/server/ai/chat-persistence.ts`, `saveThread`**: remove the hardcoded `const title = 'Untitled'`. The insert omits `title` entirely; the `onConflictDoUpdate` sets `updatedAt` only. A save must never touch a title a user gave.
3. **`src/server/db/schema/chat-threads.ts`**: the doc comment currently states the title is derived from the transcript and recomputed on save. That is now false. Rewrite it to say the title is user-owned and absent until given, and note that `user_id` exists for sync bucketing and is stamped server-side.

**Done when:** sending a message to a renamed thread leaves the name intact.

---

## Phase 3 — Server endpoints

Both are `src/routes/api.*.ts` server routes with Zod validation at the boundary.

### `api.powersync-token.ts` (GET)

Issues a short-lived HS256 JWT — use `jose` — with a fixed anonymous subject. Returns the token **and** the PowerSync endpoint URL, so the client needs no `VITE_`-prefixed environment variable of its own.

Shaped for the Clerk swap: the sync rules read only `sub`, so replacing this endpoint with a Clerk-issued token later changes `fetchCredentials` and the service's JWKS config, and nothing else.

Comment the caveat in the file: every device resolves to the same subject, so every device sees every thread. The column makes the shape right; it does not make the POC multi-tenant.

### `api.powersync-upload.ts` (POST)

The wire format is **ours to define** — `uploadData` runs client-side, reads the CRUD batch, and posts whatever shape we choose. So define it strictly:

- Zod-parse the batch at the boundary. Reject the whole batch on any invalid op; do not partially apply.
- **Table whitelist: `chat_threads` only.** Any op naming `chat_runs` is a 4xx. This is what makes "runs are read-only on the client" enforced rather than merely documented.
- **Column whitelist per op.** INSERT accepts `id` and `title`; the handler stamps `user_id` from the JWT subject and `updated_at` from the server clock. PATCH accepts `title` only. A client can never forge ownership or a timestamp.
- DELETE maps `id` → `thread_id` and runs the existing four-statement `deleteThread` transaction body.

**Done when:** a `curl` with a forged `chat_runs` op is rejected, and a valid thread INSERT appears in Postgres with `user_id` set.

---

## Phase 4 — Client integration layer

New files under `src/lib/powersync/`. No barrel file.

- **`schema.ts`** — `sqliteTable` mirrors of the two synced tables, matching the sync rules' output columns exactly (including `id`). Fed through `DrizzleAppSchema`. Plus a **type-level guard** asserting the mirror's column-name set matches the `pgTable`'s, after the `thread_id`/`run_id` → `id` rename. PowerSync's drift failure mode is a silent `null`; this makes it a build error instead.
- **`database.ts`** — module-singleton `PowerSyncDatabase`. Safe at module scope because of SPA mode.
- **`connector.ts`** — `fetchCredentials()` calling the token endpoint; `uploadData()` reading the CRUD batch, posting it to the upload endpoint, and calling `complete()` only on success so failed uploads stay queued.
- **`collections.ts`** — a collection per table via `powerSyncCollectionOptions`, each with a Zod `schema` and `deserializationSchema`: `updated_at` → `Date`, `usage` → parsed object, `status` → the `RunStatus` union rather than bare `string`.

No `onInsert` / `onUpdate` / `onDelete` handlers. `PowerSyncTransactor` writes collection mutations into local SQLite and PowerSync's upload queue owns the server round-trip — there is exactly one optimistic layer, and adding mutation handlers would create a second.

**Vite**: `@powersync/web` ships wasm and a worker. Expect to need `optimizeDeps.exclude` for the SQLite wasm package and ES-format workers — **check the current `@powersync/web` Vite guidance rather than copying an older recipe.**

**Done when:** the app boots, opens the local database, connects, and a row inserted directly into Postgres appears in a `useLiveQuery` without a refresh.

---

## Phase 5 — Application wiring

1. **`vite.config.ts`**: `tanstackStart({ spa: { enabled: true } })`.
2. **`src/routes/__root.tsx`**: await `db.init()` before rendering routes — that is opening local SQLite, which is local and fast. **Do not await `waitForFirstSync()`**; blocking render on the network defeats the entire point. `connect()` runs in the background. Mount `PowerSyncContext.Provider` (for `useStatus` only — collections hold their own database reference) and render a connection-status indicator. The indicator is not decoration: the demo's central claim is about offline behaviour, and an invisible offline state makes it unprovable.
3. **Thread list**: replace loader data with a live query joining the threads and runs collections. Badge a row when it has a run with `status = 'running'`. The join is deliberate — "do we need TanStack DB on top of PowerSync at all" is a question worth answering with evidence.
   - "New chat" inserts a local row and navigates. `thread.id` is the thread id.
   - Rename: new UI. Delete: rewire the existing modal to the collection's `delete`.
   - Null title renders as "Untitled".
4. **Chat header**: last run's final status, error, and token usage from the synced run row. This is the sharper demonstration — `usage` is written when the run ends, so a device that never attached to the stream can learn it *only* through sync.

**Done when:** two browsers, one thread. Send from A; B's list badges "generating" with no SSE connection and no polling, and B's chat header shows the token usage once the run ends.

---

## Phase 6 — Deletions and corrections

Per the repo's dead-code rule, these are part of the work, not follow-up:

- Delete `src/routes/-page/ThreadListPage/list-threads.ts` and the loader in `src/routes/index.tsx`. Keeping it "as a fallback" reintroduces a second reader of state Sync owns.
- Delete the `createServerFn` wrapper in `delete-thread.ts`; its transaction body moves into the upload endpoint.
- Rewrite the stale paragraph in `src/schema/thread.ts` that says a thread with no stored conversation is what starting a new chat looks like. As of decision 8, a thread row exists from creation.
- `pnpm lint` clean.

---

## Reporting back

State plainly, without softening:

- Which phases completed and which did not.
- Every place the PowerSync or TanStack DB docs contradicted this plan, and what you did instead.
- Whether the Phase 5 two-browser check actually passed, with what you observed — not what should have happened.
