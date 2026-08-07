# 03 — Server-only boundary: environment, model adapter, durability store

**What to build:** The server half of the POC, with a boundary a component cannot cross. Three things exist after this ticket:

1. **Validated environment.** Configuration is parsed once through a schema at boot. A missing or malformed API key fails immediately with a clear message, instead of surfacing as a confusing error on the first chat request.
2. **One module owning the model.** Provider construction and the model identifier (`qwen/qwen3.7-flash`) live in exactly one place, so changing models is a one-line edit. No call site names a model.
3. **A durability store wrapper.** The delivery-durability backend is constructed behind a wrapper of our own. Callers pass a request and get back a durability adapter; they cannot tell which backend is behind it.

The wrapper is the load-bearing piece of this ticket. The next phase of the POC replaces the in-memory backend with a Postgres-backed run log, and this wrapper is what makes that a single-file change rather than a refactor. Nothing downstream may import the backend directly.

A committed example environment file documents every required variable with dummy values. The real environment file stays git-ignored.

**Blocked by:** 01

**Status:** done

- [~] Boot fails loudly and legibly when a required environment variable is missing — mechanism built and demonstrated, but dormant until ticket 04 gives it an importer (see notes)
- [x] The model identifier appears in exactly one module
- [x] The durability backend is reachable only through the wrapper — no other module imports it
- [x] Nothing under the server directory is imported by any component
- [x] No secret or provider configuration can reach the client bundle
- [x] Example environment file is committed; the real one is ignored
- [x] App still boots and renders — this ticket adds no user-visible behaviour, and needs no API key to complete

## Completion notes

**Model id deviation.** `qwen/qwen3.7-flash` is live on OpenRouter but is not in
`@tanstack/ai-openrouter@0.15.11`'s model union (a closed union of literals; the
package's catalogue lags by a release). Shipped `qwen/qwen3.6-flash` — same
family and tier, no cast. Bumping to 3.7-flash once the package catches up is
exactly the one-line edit this ticket exists to enable. The deviation is
recorded in `adapter.ts` itself, not only here.

**Wrapper signature.** `streamStore` takes a `Request` and nothing else. An
earlier draft also accepted `{ runId, offset }` — which was `memoryStream`'s own
`MemoryStreamInit` inlined, i.e. the backend's shape leaking through the very
seam this ticket exists to build, for a caller that does not exist. Removed.

**Failure demonstration — and an honest caveat.** Demonstrated with a temporary
`src/routes/api.env-check.ts` that imported the adapter and the store; it was
deleted afterwards and is not in the tree. With `OPENROUTER_API_KEY` removed
from `.env`, a request to it died with:

```
Error: Invalid environment:

✖ Invalid input: expected string, received undefined
  → at OPENROUTER_API_KEY

Copy .env.example to .env and fill in the values.
    at src/server/env.ts:15:9
```

The caveat matters more than the demonstration. As shipped, **nothing imports
the adapter**, so `env.ts` is never evaluated and the app boots fine with no API
key at all. That is not a Vite-laziness quirk — there is simply no entry point
into the chain yet. It is also exactly what the last checklist item demands
("needs no API key to complete"), so the two criteria are in tension and this
one can only be fully satisfied by ticket 04, whose `api.chat.ts` imports the
adapter. The mechanism is built and proven; it goes live one ticket from now.
Marked `[~]` rather than `[x]` for that reason.

**`.env` loading.** Verified empirically that TanStack Start's dev server puts
`.env` values on `process.env` for server code — no `dotenv` dependency needed.

**Client bundle.** `pnpm build` then grep of `dist/client/` for `sk-or-v1`,
`OPENROUTER_API_KEY`, and `openrouter`: no matches.

**pnpm.** `@openrouter/sdk`'s install script is set to `false` in
`pnpm-workspace.yaml`. Its only `postinstall` is an optional type-availability
check (`node scripts/check-types.js || true`) and the package ships compiled
output, so skipping it is safe and unblocks `pnpm dev`.
