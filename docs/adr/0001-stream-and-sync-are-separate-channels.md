# Stream and Sync are separate channels, and no fact travels on both

This app has two ways to move state to a device: the **Stream**, which delivers a **Run**'s output live and rejoinably, and **Sync**, which replicates durable state to local storage and accepts writes back. Both could plausibly carry the **Transcript**. We decided they must not: **Sync** carries **Threads** and **Run** state, the **Stream** carries **Run** output, and the **Transcript** is served by neither — the chat client hydrates it over HTTP as it already did.

## Considered options

**Syncing the Transcript as well.** Rejected. A save rewrites every message row in a **Thread** on every turn, so one reply becomes N replication operations and every connected device re-downloads the whole conversation per turn. Fixing that means an incremental write path — worth doing eventually, but it would have to be done *before* the integration could even be measured, and failing at it would tell us nothing about whether the two technologies can coexist.

**Syncing the Transcript read-only, for cold hydration only.** Deferred, not rejected. It puts a synced copy of a message and a still-streaming version of the same message on screen at once, and the reconciliation between them is where the genuinely hard problems live. That deserves to be its own exercise with this decision already banked.

**Syncing the Delivery Log.** Rejected outright. It is one row per token; replicating it would both overwhelm the replication slot and constitute a second, competing delivery channel for data the **Stream** already delivers.

## Consequences

- A device that is not attached to the **Stream** can still see that a **Thread** has a **Run** in flight, and whether it finished or failed, without polling. That is the point of the arrangement.
- It cannot see what that **Run** is *saying* without attaching to the **Stream**. This is a deliberate limit, not a gap to close later.
- The two halves of the system fail independently. A broken sync service does not stop a conversation; a broken stream does not stop the thread list from loading offline.
