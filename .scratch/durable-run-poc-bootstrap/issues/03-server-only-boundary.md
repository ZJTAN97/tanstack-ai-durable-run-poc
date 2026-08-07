# 03 — Server-only boundary: environment, model adapter, durability store

**What to build:** The server half of the POC, with a boundary a component cannot cross. Three things exist after this ticket:

1. **Validated environment.** Configuration is parsed once through a schema at boot. A missing or malformed API key fails immediately with a clear message, instead of surfacing as a confusing error on the first chat request.
2. **One module owning the model.** Provider construction and the model identifier (`qwen/qwen3.7-flash`) live in exactly one place, so changing models is a one-line edit. No call site names a model.
3. **A durability store wrapper.** The delivery-durability backend is constructed behind a wrapper of our own. Callers pass a request and get back a durability adapter; they cannot tell which backend is behind it.

The wrapper is the load-bearing piece of this ticket. The next phase of the POC replaces the in-memory backend with a Postgres-backed run log, and this wrapper is what makes that a single-file change rather than a refactor. Nothing downstream may import the backend directly.

A committed example environment file documents every required variable with dummy values. The real environment file stays git-ignored.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Boot fails loudly and legibly when a required environment variable is missing
- [ ] The model identifier appears in exactly one module
- [ ] The durability backend is reachable only through the wrapper — no other module imports it
- [ ] Nothing under the server directory is imported by any component
- [ ] No secret or provider configuration can reach the client bundle
- [ ] Example environment file is committed; the real one is ignored
- [ ] App still boots and renders — this ticket adds no user-visible behaviour, and needs no API key to complete
