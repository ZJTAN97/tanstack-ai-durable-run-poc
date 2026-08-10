# What's in the server, what's in the client

**Touches:** `src/server/`, `src/routes/api.chat.ts`, `src/routes/index.tsx`,
`src/routes/-page/HomePage/`

## Summary

TanStack Start is a fullstack framework with no build-time enforcement of the
boundary — get it wrong and an API key ends up in the browser bundle. The rule
that keeps it right here is structural rather than disciplinary: **`src/server/`
is server-only, and nothing under `src/routes/-page/` may import from it.**

```
src/server/          ← env, adapter, durability backend, persistence, db      SERVER ONLY
src/routes/api.*.ts  ← the only network surface                               SERVER
src/schema/          ← Zod, shared across the boundary                        BOTH
src/routes/-page/    ← React components                                       CLIENT (+ SSR)
```

The client's total knowledge of the backend is **one string: `'/api/chat'`.** No
model name, no run-log format, no database, no offset scheme. Everything else it
needs arrives over the wire.

---

## The layers, top to bottom

| Layer | File | Knows about |
| :-- | :-- | :-- |
| Component | `Conversation.tsx` | `useChat`, a thread id |
| Chat options | `create-chat-options.ts` | the URL `'/api/chat'`, `persistence: true` |
| — network boundary — | | |
| Endpoint | `routes/api.chat.ts` | `chat()`, the two response helpers, two seams |
| Seam | `ai/stream-store.ts` | that a durability backend exists |
| Seam | `ai/chat-persistence.ts` | that four stores exist |
| Backend | `ai/postgres-stream.ts` | Postgres, offsets, LISTEN/NOTIFY |
| Backend | `db/client.ts`, `db/schema/` | Postgres |

Each layer names only the layer below it. The endpoint imports `streamStore`, not
`postgresStream` — swapping the in-memory backend for Postgres was a change to
`stream-store.ts` and **no other file**. That seam has now been used once in
anger, which is the only evidence that an abstraction was worth having.

## Server-only

### `src/server/env.ts`

```ts
const parsedEnvironment = environmentSchema.safeParse(process.env)
if (!parsedEnvironment.success) throw new Error(`Invalid environment:\n\n${…}`)
export const env = parsedEnvironment.data
```

One Zod parse, at import time, so a misconfigured server **dies at boot with the
list of what's wrong** rather than on the first chat request with a provider 401.
No scattered `process.env.FOO!`.

This module is also the tripwire: anything importing it is server-only by
construction. `adapter.ts`, `db/client.ts` and `append-notifications.ts` all do.

### `src/server/ai/adapter.ts`

The API key and the model name, together, in the only module that names either.
Never construct an adapter inside a route handler.

### `src/server/ai/stream-store.ts` — the durability seam

```ts
export function streamStore(request: Request, producedRunId?: string): StreamDurability
export function sweepExpiredRunLogs()
```

Two properties worth copying:

- **The declared return type is narrowed to `StreamDurability`**, hiding the
  optional upsert capability, so no caller can come to depend on something a
  future backend may not have.
- **Housekeeping goes through the same seam as the log.** Whether reclamation is a
  `DELETE`, a key TTL, or a dropped partition is the backend's business — so
  `sweepExpiredRunLogs` is wrapped here too, and the endpoint never imports
  Postgres to do its own cleanup.

### `src/server/ai/chat-persistence.ts` — the conversation seam

Four store implementations behind one `ChatPersistence` value. The endpoint hands
that value to the middleware and to `reconstructChat` and knows nothing about
what's behind it.

### `src/server/db/`

Pool, schema, migrations. One file per domain table.

## The boundary itself: `src/routes/api.chat.ts`

The only network surface. There is no Axios instance, no client-side base URL,
and no `createServerFn` in the chat path — a durable run needs streaming and a
real HTTP contract, which is what server routes are for.

Every inbound payload is Zod-parsed at the boundary:

```ts
startRunRequestSchema.safeParse(body)      // POST
resumeRunRequestSchema.safeParse({ runId, offset })   // GET resume
```

Failures become 400s with `z.prettifyError`. Nothing is cast.

The endpoint imports **no** backend module. Its longest comment exists to say so:
*"Which backend the log lives in is `streamStore`'s business. Nothing here may
name one."*

## Shared: `src/schema/`

Zod schemas that both sides legitimately need — the run-identity rules and the
thread-id rules. These contain no secrets and no server imports, which is exactly
the test for whether something belongs here.

`thread.ts` is consumed by the route's `validateSearch`, so it runs on both
sides. `chat.ts` currently only runs server-side but describes a contract the
client fulfils, so it belongs to the boundary rather than to the server.

## Client

### `src/routes/index.tsx`

```ts
export const Route = createFileRoute('/')({
  validateSearch: threadSearchSchema,
  component: HomePage,
  errorComponent: InvalidThreadNotice,
})
```

Route definition only. No loader is needed for the chat, because `useChat` does
its own hydration — the endpoint's `GET ?threadId=` is a fetch the library
issues, not one we wire.

### `create-chat-options.ts` — the client's entire view of the backend

```ts
const durableChatConnection = fetchServerSentEvents('/api/chat')   // module scope

export function createChatOptions(threadId: string) {
  return createChatClientOptions({
    connection: durableChatConnection,
    persistence: true,
    threadId,
  })
}
```

- **Module scope, because `useChat` reads the transport once.** The connection it
  is constructed with is the one it keeps; rebuilding per render is waste.
- **`persistence: true` is server-authoritative — the browser caches nothing.**
  That is a stronger claim than the `localStorage` record it replaced, not just a
  tidier one: a cached blob makes a reload resumable *in that browser*, while a
  run pointer resolved from Postgres makes it resumable anywhere the URL goes.
  The whole reason the transcript moved into Postgres was to be read back, and
  this is the read.
- **Types are inferred across the boundary**, never hand-written:

  ```ts
  export type ConversationMessage = InferChatMessages<ReturnType<typeof createChatOptions>>[number]
  export type ConversationMessagePart = ConversationMessage['parts'][number]
  ```

### State allocation on the client

| State | Where | Why |
| :-- | :-- | :-- |
| `threadId` | URL search param | survives reload, shareable, SSR-stable |
| transcript, `isLoading`, `error` | `useChat` | the library owns it |
| composer draft | `useState` in `Composer` | genuinely local, dies with the box |
| scroll position | `use-stick-to-bottom` | DOM, needs listeners and cleanup |

No global store. No client-side transcript cache. **A thread switch is a `key`,
not a reset effect:** `<Conversation key={threadId} threadId={threadId} />`
builds a fresh chat client against the new thread rather than carrying the
previous conversation into it.

### Effects: fewer than expected

The one `useEffect` CLAUDE.md pre-authorised — rejoining a run — **turned out not
to be needed**, because `useChat` hydrates and tails as it constructs its client.
Writing it anyway would have created a second consumer of the same run, racing
the one that already exists.

Two related refusals in the same directory:

- Focusing the composer on mount is a **ref callback**, not an effect — touching
  the DOM, not synchronising state. Memoised with `useCallback` because React
  re-invokes a ref callback whose identity changed, and an inline one would steal
  focus back on every keystroke. (One of the two legitimate uses of
  `useCallback`: breaking a loop.)
- Sending a message lives in the **click/keydown handler**. No effect watches the
  draft and decides to submit it.

### Rendering: a message is a list of parts

```tsx
switch (part.type) {
  case 'text':        return <Text>{part.content}</Text>
  case 'thinking':    return <ThoughtProcess reasoning={part.content} />
  case 'tool-call':   return <ToolActivity label={`Used ${part.name}`} payload={part.arguments} />
  case 'tool-result': return <ToolActivity … />
  default:            return <Badge>unrendered part — {part.type}</Badge>
}
```

Reading `parts[0].content` and calling it the message works right up until the
model thinks first, and then renders a blank reply. The `default` branch exists
so a part type this app has never seen degrades to a label instead of taking the
page down mid-stream.

A related UX consequence of the same fact: a reasoning model finishes *all* of
its thinking before emitting a character of prose, and this app collapses
reasoning behind a disclosure — so without an explicit "has produced text yet"
check the whole thinking phase shows one small label and the reply reads as dead.

## The things that leak if you get it wrong

| Mistake | Consequence |
| :-- | :-- |
| A component imports `@/server/env` | the OpenRouter key ships in the browser bundle |
| The route imports `postgresStream` directly | swapping the backend touches the endpoint; the seam was theatre |
| `createServerFn` for the chat stream | no streaming, no `Last-Event-ID`, no real HTTP contract |
| Casting a request body instead of parsing it | a malformed `runId` becomes an unrejoinable run, discovered later |
| Client-side transcript cache | reload works in one browser and nowhere else, and you'll believe the claim is proven |
| `reconstructChat` with no `authorize` | anyone guessing a `?threadId=` gets the full transcript |

## Transferable lessons

- **Make the boundary structural, not disciplinary.** One directory that is
  server-only, one module that parses env, and everything importing it inherits
  the constraint. A convention nobody can accidentally violate beats one everyone
  must remember.
- **Let the client know exactly one thing about the server: the URL.** Model,
  storage, cursor format and schema are all details that never crossed.
- **A seam is only proven when it's used.** `stream-store.ts` earned its existence
  the day memory→Postgres changed one file. Seams that have never absorbed a
  change are speculation.
- **Narrow a seam's return type to the capabilities you promise**, not the ones
  today's implementation happens to have.
- **Server-authoritative beats client-cached for anything you want to claim.** The
  cache makes a demo *look* right in the browser you tested. The server answer
  makes it *be* right in the next tab.
- **Check whether the library already owns the effect you're about to write.** The
  one effect the conventions permitted was still one too many.
