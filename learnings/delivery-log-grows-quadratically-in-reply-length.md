# The delivery log grows quadratically in reply length

**Date:** 2026-08-10
**Touches:** `src/server/ai/postgres-stream.ts`, `src/server/db/schema/delivery-log-events.ts`

## What prompted it

One thread with four messages had put **1,111 rows and 1.16 MB** into
`delivery_log_events`. The row count looked like the problem. It wasn't.

## What was actually happening

Row count is a red herring. ~550 narrow rows per assistant reply is simply what
token-level streaming looks like, and Postgres does not care about 550 rows. The
bytes were the problem, and grouping by chunk type showed where they lived:

```
type                       | count |  bytes | avg_bytes
TEXT_MESSAGE_CONTENT       |   449 | 693 kB |      1580   ← 75% of all bytes
REASONING_MESSAGE_CONTENT  |   640 | 118 kB |       188
everything else            |    22 |   9 kB |
```

640 reasoning rows cost less than a quarter of what 449 text rows cost. The
difference is one JSONB key. `TEXT_MESSAGE_CONTENT` is the only chunk type that
carries `content` alongside `delta`, and `content` is **every delta before it**:

```
  id   | delta_len | content_len
 12587 |         5 |           5
 12588 |         6 |          11
 12589 |        15 |          26
 12590 |        34 |          60     ← content = sum of all preceding deltas
```

So each row re-stores the entire message-so-far. The cost of a run is therefore
`O(reply length²)`, empirically `bytes ≈ length² / 26`:

| Reply length | Bytes in the log |
| --- | --- |
| 3.2k chars (measured) | 421 kB |
| 10k chars | 3.8 MB |
| 30k chars | 34 MB |

3,205 characters of reply produced 421,067 bytes of log — **131× amplification**,
and it worsens with length. Retention bounds *how many* of these you hold; it
does nothing about the size of any one of them. These are independent problems
and they need independent fixes.

## Why the field is safe to drop

The library's own type says it is not load-bearing:

```ts
/** Full accumulated content so far (TanStack AI internal, for debugging) */
content?: string;
```

A comment is not proof, so the consumer was traced.
`activities/chat/stream/processor.js`, `handleTextMessageContentEvent`:

```js
const delta = chunk.delta || "";
if (delta !== "") nextText = currentText + delta;
else if (chunk.content !== void 0 && ...)   // fallback only
```

`delta` is authoritative; `content` is consulted only when no delta is present.

That fallback is what dictates the shape of the fix. Stripping `content`
unconditionally would break a provider that emits content-only chunks. Stripping
it **only when a non-empty `delta` is present** leaves that path byte-for-byte
intact, because the mirror is discarded only when the thing that rebuilds it is
right there in the same row.

The guard proved to be doing real work, not decoration: after the change, one row
per run still carries `content` — `STEP_FINISHED`, which has no `delta`. The rule
correctly left it alone.

## Result

Measured on a real run through the app, before and after:

| | Before | After |
| --- | --- | --- |
| `TEXT_MESSAGE_CONTENT` avg row | 1,580 bytes | **186 bytes** |

A `GET ?offset=-1` replay of the stripped log reassembled the complete
1,389-character reply from deltas alone.

## Transferable lessons

- **Amplification, not row count, is the metric for an append-only event log.**
  Divide bytes stored by bytes of new information. 215× is a design flaw; you
  cannot see it by looking at `count(*)`.
- **Group by event type before optimising.** Two chunk types differing by a
  single key differed 8× per row. The average across the table hid that.
- **A cumulative field in a per-delta event is quadratic.** Any `content`,
  `accumulated`, `snapshot`, or `fullText` beside a `delta` is the same bug.
- **"Store it verbatim" is a good default that deserves exactly one exception
  each time it earns one** — narrow, measured, guarded, and written down where
  the next reader will look. Both this file and the table's own comment name it,
  so the principle stays trustworthy instead of quietly becoming false.
- **Verify a field is unused by reading the consumer, not the docstring.** The
  docstring said "for debugging"; the processor's fallback branch is why the fix
  is conditional rather than blanket. That branch would never have surfaced from
  the comment alone.
