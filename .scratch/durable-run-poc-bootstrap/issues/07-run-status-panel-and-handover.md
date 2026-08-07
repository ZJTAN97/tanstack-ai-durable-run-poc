# 07 — Run status panel, verification pass, and handover

**What to build:** The measurement apparatus that makes the POC's claim falsifiable, plus the verification and documentation that close out the bootstrap.

## The panel

Without it, the headline demo is unfalsifiable. A user sends a message, reloads mid-stream, and sees text appear. Three very different things produce that identical picture:

- the client genuinely rejoined a live run and tailed it to completion — **the claim**
- browser storage repainted a transcript that had already finished — **proves nothing**
- the model was silently re-run from scratch — **the claim is false**

The panel resolves the ambiguity with one field: **the run id must be unchanged across the reload.** A different id means it re-ran. An absent id means it never rejoined. The same id, still streaming, is the proof.

The panel surfaces, live: the thread id, the current run id, the chat status, the connection status, whether a reply is generating, and **which durability backend is active**.

It also states plainly what is **not** covered. The POC proves two tiers:

| Covered | Claim |
| :-- | :-- |
| Yes | A client disconnects or reloads while the server keeps running; the run continues and the client rejoins |
| Later | A completed run's log outlives the process and replays after a restart — arrives with the Postgres backend |
| **No** | **The server dies mid-run and another process takes the run over and finishes it** |

That third tier is not a gap the Postgres backend closes. If the process dies mid-run the producer dies with it, leaving a log that never terminalised — and a client rejoining it would wait forever for a terminal event that is never coming. Closing it needs run-takeover machinery (a run store, a lock store, fencing) and is a separate project. The panel says so, so the demo cannot over-claim by omission.

## Verification and handover

Lint and typecheck clean, the app boots, and the idle state is confirmed rendering in a real browser.

A README carrying the exact test procedure — start a long run, note the run id, reload mid-stream, confirm the run id is unchanged and the reply completes — and a plain statement of **what was verified and what was not**. The live durability test requires an API key held by the project owner, so the handover must say clearly whether that path was exercised or merely built.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Panel shows thread id, run id, chat status, connection status, generating state, and the active durability backend
- [ ] Panel states the uncovered tier explicitly, in the UI rather than only in documentation
- [ ] Run id is visibly stable across a mid-stream reload when durability is working
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] App boots and the idle state is confirmed rendering in a real browser
- [ ] README documents the durability test procedure step by step
- [ ] Handover explicitly separates what was verified from what was not
