# Project Context & Guidelines

---

## 1. Commands

```bash
# Database (start this before pnpm dev)
docker compose up -d      # Postgres on localhost:5432
docker compose down       # stop; add -v to wipe the volume

# Development
pnpm dev          # http://localhost:3000 (do not start a second instance)

# Schema changes
pnpm db:generate  # drizzle-kit generate — write SQL migrations from schema
pnpm db:migrate   # drizzle-kit migrate  — apply them
pnpm db:studio    # drizzle-kit studio   — inspect data

# Quality
pnpm lint         # Biome check
pnpm lint --write # Auto-fix

# Build
pnpm build && pnpm start
```

There is **no test suite** in this POC. Do not add Vitest, RTL, or test files unless explicitly asked — a half-maintained suite is worse than none. Verify work by running the app.

---

## 2. Architecture & "Anti-Vibe-Coding" Safeguards

### Cognitive Load & Structure
- **Max 4 Chunks:** If a function contains more than 4 distinct logical blocks, break it apart.
- **Deep Modules:** Prefer deep modules (simple public interface, complex internal logic) over many shallow, over-abstracted folders.
- **Composition over Inheritance:** Keep components flat, trace-friendly, and easy to follow.
- **Good Duplication:** A little duplication is better than a bad abstraction or tight coupling. Do not abuse DRY — it produces abstractions that are hard to modify or extend.
- **File Isolation:** Strictly max 1 React component per file. Move child components and complex helpers to their own files.

### Variables & Comments
- **Intermediate Variables:** Extract complex conditionals into descriptive boolean variables. No unreadable inline chains of `&&` or nested ternaries.
- Full, human-readable names. No shortforms or abbreviations.
- **No Self-Evident Comments:** Never write "WHAT" comments that restate the code.
- **Intentional Comments:** Only high-level summaries or "WHY" comments for non-obvious decisions.
- *Note:* If a comment exists to justify a workaround, the code is probably wrong. Fix the logic first.

### TypeScript & Zod
- **Infer Everywhere:** Let TypeScript infer locals, loop variables, and return types.
- **No Explicit Types on Inference:** Don't annotate when the assignment makes the type obvious.
- **Boundary Validation:** Every request body, response payload, server function input, tool input/output, and environment variable gets a strict Zod schema. Parse at the boundary — never cast.
- **Zod Inference:** Types come from `z.infer<typeof schema>`. Never hand-maintain a duplicate interface.
- **Server function inputs:** validate with `.inputValidator(schema)` so the boundary is enforced by the framework, not by a manual `schema.parse()` inside the handler.

---

## 3. TanStack Start: Client / Server Boundary

This is the rule that matters most in a fullstack app — get it wrong and secrets leak into the bundle.

### Where code runs
- **`src/routes/*/route.tsx`** — route definition only: `createFileRoute()` with `loader`, `component`, `errorComponent`, `pendingComponent`. Data is fetched here so page components stay presentational.
- **`createServerFn()`** — RPC-style server logic called from loaders and event handlers. Default `GET`; use `{ method: 'POST' }` for writes.
- **`src/routes/api.*.ts`** — server routes (raw `Request`/`Response`). Use these when you need streaming, SSE, or a real HTTP contract — which is exactly the durable-run case.
- **`src/server/`** — server-only modules (AI adapter, durable stream store, database client and schema, provider config). Nothing here may be imported by a component.

### Non-negotiables
- API keys, adapter construction, and provider config live **only** in `src/server/`. If a module reads `process.env`, a component must never import it.
- Environment variables (`OPENROUTER_API_KEY`, `DATABASE_URL`, …) are parsed once through a Zod schema in `src/server/env.ts`. No scattered `process.env.FOO!` non-null assertions.
- Server functions and server routes are the only network surface. There is no Axios instance and no client-side base URL.
- Loaders prefetch; components render. If a component fetches its own data, the loader is in the wrong place.

---

## 4. TanStack AI & Durable Runs

The core of the POC. Treat these as hard conventions.

### Adapter
One module owns provider construction — swapping models must be a one-line change:

```ts
// src/server/ai/adapter.ts
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { env } from '@/server/env'

export const textAdapter = createOpenRouterText('openai/gpt-5', env.OPENROUTER_API_KEY, {
  httpReferer: env.APP_URL,
  appTitle: 'tanstack-ai-durable-run-poc',
})
```

Never construct an adapter inside a route handler, and never inline a model string at a call site.

### Run identity
- Every run is identified by a stable **`threadId`** and **`runId`**. Generate them deterministically and persist them (URL param or storage) — a run you cannot name is a run you cannot resume.
- Derive the ids from the route where possible (e.g. `/runs/$runId`) so a reload naturally rejoins the correct run.

### Server: POST starts, GET resumes
A durable run requires **both** handlers. A POST-only endpoint is not durable.

```ts
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { textAdapter } from '@/server/ai/adapter'
import { streamStore } from '@/server/ai/stream-store'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, threadId, runId } = await chatParamsFromRequest(request)
        const stream = chat({ adapter: textAdapter, messages, threadId, runId })

        return toServerSentEventsResponse(stream, {
          durability: { adapter: streamStore(request) },
        })
      },
      // joinRun hits GET ?offset=-1&runId=... — replay only, no new messages.
      GET: async ({ request }) => {
        return resumeServerSentEventsResponse({ adapter: streamStore(request) })
      },
    },
  },
})
```

- The durability adapter lives in `src/server/ai/stream-store.ts` and the route imports `streamStore` from it and nothing else. The route must not care which backend is behind it — but hide the backend by making that module *be* the store, not by wrapping one. A pass-through whose only output is a rename costs a code jump and buys nothing.
- **`memoryStream` is for first-light development only.** It lives in process memory, so it dies with the server and cannot be shared across processes — it proves reconnect, not durability. The POC's actual claim requires the Postgres-backed run log (see §5).
- Whichever adapter is active must be stated plainly in the demo. A memory-backed run that survives an F5 is not evidence of a durable run.

### Writing the Postgres durability adapter
The run log is an append-only table keyed by `runId`, where every row's cursor is the resume offset. When implementing `StreamDurability`, these rules are not optional:

- **Replay strictly after the given offset**, and treat `-1` as from-start, `now` as from-tail.
- **Stop at a terminal chunk** (`RUN_FINISHED` / `RUN_ERROR`).
- **Park, never return empty, while the producer is alive.** Returning an empty read ends the response and surfaces as a "stream incomplete" error to the client. Wait for a change instead — LISTEN/NOTIFY or a bounded poll.
- **Respect the `AbortSignal`** so a disconnected client stops the wait.

Chunks are appended as JSONB; the row id is the cursor. Do not invent a second identifier scheme.

### Client
- `useChat` from `@tanstack/ai-react` with `fetchServerSentEvents('/api/chat')` as the connection.
- Build options with `createChatClientOptions` and derive message types via `InferChatMessages` — do not hand-type message parts.
- Render `message.parts` by `part.type` (`text`, `thinking`, `tool-call`, …). Never assume a message is a plain string.
- **Rejoining a run is the one legitimate `useEffect`** in this codebase: it synchronises with an external stream and needs cleanup. Every other rule in §7 still applies.

### Tools
- Define with `toolDefinition({ name, description, inputSchema, outputSchema })` using Zod schemas — this is the boundary validation rule applied to AI I/O.
- Keep definitions provider-agnostic in a shared module; attach `.server()` or `.client()` implementations where they actually run.
- Use `needsApproval: true` with an `approvalSchema` for any tool with side effects, and handle it via `addToolApprovalResponse`.

---

## 5. Database (Postgres + Drizzle)

Postgres is not incidental infrastructure here — it is what makes a run *durable* rather than merely reconnectable. Add tables only where the POC needs them: the run log, and thread/message history if the demo requires reloading a conversation.


### Client
One pooled client, constructed once in `src/server/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '@/server/env'
import * as schema from '@/server/db/schema'

const pool = new Pool({ connectionString: env.DATABASE_URL })

export const db = drizzle({ client: pool, schema })
```

Vite's HMR re-executes modules on every save, so in development the pool must be cached on `globalThis` — otherwise each hot reload leaks a pool and Postgres refuses connections within minutes. This is a genuine external-resource lifecycle problem, not premature optimisation.

### Schema & migrations
- Tables live in `src/server/db/schema/`, one file per domain (`runs.ts`, `run-events.ts`), mirroring how `src/schema/` is organised for Zod.
- `drizzle.config.ts` sits at the repo root: `dialect: 'postgresql'`, schema path, `out: './drizzle'`, and `dbCredentials.url` from the environment.
- **Migrations are generated, committed, and applied — never hand-edited.** `pnpm db:generate` then `pnpm db:migrate`. Do not use `drizzle-kit push` outside throwaway experiments; it skips the migration history and makes the schema unreproducible.
- Query with the typed builder or `db.query.*`. Raw SQL only where Drizzle genuinely cannot express it (e.g. `LISTEN`/`NOTIFY`), and never with interpolated user input — use the `sql` template tag.

### Drizzle vs Zod — who owns the type?
Both are sources of truth, for different boundaries. Keep them apart:

- **Drizzle owns persistence.** Row types come from `typeof table.$inferSelect` / `$inferInsert`. Never hand-write a row interface.
- **Zod owns the network boundary.** Request bodies, server function inputs, and AI tool schemas are Zod, parsed on arrival.
- A database row is not automatically a valid API payload. Map between them explicitly rather than leaking column shapes to the client — and use `drizzle-zod` where a schema is a genuine mirror of a table, instead of maintaining two definitions by hand.

---

## 6. React 19 & State

### State Allocation
- **Default to Local:** Component state or route loader data first.
- **URL is state:** Anything that should survive reload or be shareable — the active run, filters, selected thread — belongs in route params or validated search params, not React state. This matters directly for durability.
- **No global store:** There is no Zustand/Redux in this project. If two disconnected components genuinely need shared state, lift it or use context — and justify it.
- **Mantine Hooks First:** Check `@mantine/hooks` (`useDisclosure`, `useDebouncedValue`, `useLocalStorage`, `useListState`) before writing a custom hook.

### Performance Restrictions
- **No Premature Optimization:** Do **NOT** reach for `useMemo` or `useCallback` by default. Take this seriously.
- **Exception:** Only to break an infinite re-render loop, or for measurably expensive work (thousands of rows). React 19 + the compiler make most manual memoisation dead weight.

---

## 7. Anti-Effect Rules (`useEffect` Enforcement)

> **The Golden Rule:** `useEffect` is strictly an escape hatch for synchronising with an **external system** (streams, WebSockets, timers, manual DOM, non-React widgets). If you are not synchronising with an external system, **DO NOT use `useEffect`.** Take this rule very seriously.

### Prohibited Patterns & Required Fixes

| If the goal is...       | ❌ DO NOT DO THIS                                    | 👉 CLEAN ALTERNATIVE                                          |
| :---------------------- | :-------------------------------------------------- | :----------------------------------------------------------- |
| **Transforming Data**   | Syncing derived state via `useEffect`               | Compute directly during render.                              |
| **User Action Events**  | Running code in an effect because the user clicked  | Keep the logic in the event handler (`onClick`, `onSubmit`). |
| **Resetting State**     | Clearing state in an effect when an id prop changes | Pass a `key` to the container (`<RunView key={runId} />`).   |
| **Data Fetching**       | `fetch` inside a component `useEffect`              | Route loader + `createServerFn`.                             |
| **Streaming AI output** | Manual `EventSource` wiring in an effect            | `useChat` with `fetchServerSentEvents`.                      |

### Permitted
Rejoining or tailing a durable run, and global browser listeners requiring cleanup. Both must return a cleanup function.

### Output Protocol for Code Reviews
If code contains a `useEffect`, evaluate it against the table. If it is an anti-pattern, explain why and supply the refactored version. Only permit it for an un-encapsulated external API or a listener needing cleanup.

---

## 8. Styling & UI (Mantine v9.5x + CSS Modules)

### Priority Order
1. **Mantine components & props:** `Stack`, `Group`, `Center`, `Grid`, `Flex`; utility props `gap`, `p`, `m`, `c`, `variant`, `size`, `radius`.
2. **CSS Modules:** `import classes from './Foo.module.css'` ➔ `<div className={classes.root}>`.
   - Use design tokens: `var(--mantine-spacing-md)`, `var(--mantine-color-blue-filled)`. Never hardcode px or hex.
   - Always support light and dark mode when defining custom colours.
3. **Inline styles — forbidden.** Never `style={{ }}` for static styling. *Exception:* one-off runtime-computed values (e.g. a streaming progress width). Flag the exception in your changelog output.

No Tailwind, no CSS-in-JS, no global stylesheets beyond `theme.css` and Mantine's own imports.

### SSR Requirements
Mantine under SSR needs explicit setup in `src/routes/__root.tsx` — miss it and you get a flash of the wrong colour scheme plus hydration mismatches:
- Import `@mantine/core/styles.css` (and any package styles) in the root route.
- Render `<ColorSchemeScript />` in the document `<head>`.
- Spread `mantineHtmlProps` onto the `<html>` element.
- Wrap the app in a single `<MantineProvider theme={theme}>`.

### CSS Animations
- **Enter animations via `@starting-style`:** For animate-on-mount effects, prefer native CSS over JS state or animation libraries. Define the resting state plus a `transition`, then nest `@starting-style` with the initial values:

  ```css
  .illustration {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 0.5s ease, transform 0.5s ease;

    @starting-style {
      opacity: 0;
      transform: translateY(-24px);
    }
  }
  ```
- **Respect Reduced Motion:** Always neutralise transitions under `@media (prefers-reduced-motion: reduce)`.
- **Graceful Fallback:** Older browsers skip the animation and render the final state — so the resting state must always be the correct no-animation fallback.
- **Lint Note:** Biome/postcss may flag `@starting-style` as an unknown at-rule. That is a false positive, not an error.

---

## 9. Folder Structure & Co-location

### Repo Root

| Path                 | Responsibility                                                        |
| :------------------- | :-------------------------------------------------------------------- |
| `docker-compose.yml` | Local Postgres.                                                       |
| `drizzle.config.ts`  | drizzle-kit config — schema path, `out`, dialect, credentials.        |
| `drizzle/`           | Generated SQL migrations. Committed, never hand-edited.               |
| `.env.example`       | Every required variable, with dummy values. Committed. `.env` is not. |

### Top-level Map (`src/`)

| Path                      | Responsibility                                                                                                                                                           |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`                 | File-based routes: page routes and `api.*.ts` server routes. Generated route trees (`routeTree.gen.ts`) are build artifacts — never edit by hand.                        |
| `server/`                 | Server-only modules: `env.ts`, `ai/adapter.ts`, `ai/stream-store.ts`, `ai/tools/`, `db/client.ts`, `db/schema/`. Never imported by a component.                          |
| `schema/`                 | Zod schemas shared across the client/server boundary — one file per domain. Single source of truth via `z.infer`. Drizzle tables are **not** here; they are server-only. |
| `lib/`                    | Cross-cutting client integrations only. Not a junk drawer — a helper belongs next to its consumer.                                                                       |
| `components/`             | **Only** components used by two or more routes.                                                                                                                          |
| `theme.css`, `router.tsx` | Mantine theme tokens and router creation.                                                                                                                                |

### Route Folders: definition vs implementation

Each route folder separates *routing* from *rendering*:

- **`route.tsx`** — the route definition only: `createFileRoute()` with `loader`, `component`, `errorComponent`, `pendingComponent`.
- **`-page/`** — the implementation. The `-` prefix excludes the directory from route generation, so it may hold components, hooks and utils belonging to that page alone.

```
routes/
├── __root.tsx                # Mantine SSR setup + document shell
├── index.tsx                 # route definition for "/"
├── -page/HomePage.tsx        # its implementation
├── api.chat.ts               # durable-run SSE: POST starts, GET resumes
└── runs_.$runId/
    ├── route.tsx             # loader + Route only
    └── -page/
        ├── RunPage.tsx
        ├── RunPage.module.css
        ├── <FeatureSection>/  # page-local component tree
        ├── hooks/             # use-<something>.ts
        └── utils/             # pure helpers, one export per file
```

### Component Folders

One PascalCase folder per component, named after the component. It holds the `.tsx`, its `.module.css`, and nested subfolders for the children it owns — however deep that goes.

```
<ParentComponent>/
├── <ParentComponent>.tsx
├── <ParentComponent>.module.css
├── constants.ts
├── hooks/use-<behaviour>.ts
└── <ChildComponent>/
    ├── <ChildComponent>.tsx
    └── <ChildComponent>.module.css
```

### The Co-location Rules

These are the load-bearing conventions — the trees above are just their consequence.

- **Nest by ownership, not by type.** A component used only by `<Parent>` lives inside `<Parent>/`. Deep nesting is correct and expected.
- **Hoist on the second consumer, never in anticipation.** Move something to `src/components/` only when a second route actually imports it.
- **Promote a file to a folder when it grows siblings.** `foo.ts` becomes `foo/foo.ts` once it gains a second closely-bound file.
- **No barrel files.** No `index.ts` re-exports anywhere. Import the explicit path.
- **Path alias:** `@/*` → `src/*`. Use the alias for anything outside the current folder; relative imports only for direct siblings and children.

### Naming Conventions

| Kind                             | Case                                                       | Example                                 |
| :------------------------------- | :--------------------------------------------------------- | :-------------------------------------- |
| Components + their folders       | `PascalCase`, folder matches file                          | `RunTimeline/RunTimeline.tsx`           |
| Hooks                            | `kebab-case`, `use-` prefix                                | `hooks/use-run-stream.ts`               |
| Utils / schemas / server modules | `kebab-case`                                               | `server/ai/stream-store.ts`             |
| Drizzle tables                   | `kebab-case` file, `camelCase` export, `snake_case` column | `db/schema/run-events.ts` → `runEvents` |
| CSS Modules                      | matches its component                                      | `RunTimeline.module.css`                |
| Static route segments            | lowercase                                                  | `settings/`                             |
| Server routes                    | `api.<name>.ts`                                            | `api.chat.ts`                           |
| Dynamic route segments           | router convention                                          | `runs_.$runId/`                         |


<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
