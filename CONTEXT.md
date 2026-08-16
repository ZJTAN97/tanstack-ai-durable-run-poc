# Durable Chat

A conversation the server owns, so that it survives the browser that started it. The proof is in two independent delivery channels: one carries an in-flight reply, the other carries everything that is durably true about the conversation.

## Language

### The conversation

**Thread**:
A conversation with a stable identity of its own, addressable and rejoinable from any device. It exists from the moment someone creates it — before anything has been said in it.
_Avoid_: chat, session, conversation

**Transcript**:
The durable record of what was said in a **Thread**.
_Avoid_: history, log, messages

**Title**:
The name a user gave a **Thread**. Absent until someone gives one; a **Thread** is never named on its owner's behalf.
_Avoid_: name, subject, summary

### Generation

**Run**:
One turn of generation within a **Thread**, named before it has produced anything.
_Avoid_: request, generation, completion, job

**Delivery Log**:
The append-only record of a **Run**'s output, kept so a reader who dropped mid-**Run** can rejoin without loss. It is transport, not memory — it is reclaimed once nobody could still need it, and what was said survives in the **Transcript** regardless.
_Avoid_: run log, event log, stream buffer

**Detached Run**:
A **Run** still producing with no reader attached.

### The two channels

**Stream**:
The channel that carries a **Run**'s output while it is in flight. Live, ordered, rejoinable, and short-lived.
_Avoid_: socket, connection, feed

**Sync**:
The channel that replicates durable state to a device and accepts that device's writes back. Eventually consistent, offline-tolerant, and long-lived.
_Avoid_: replication, refresh, polling

## Relationships

- A **Thread** holds one **Transcript** and zero or more **Runs**
- A **Run** belongs to exactly one **Thread** and has at most one **Delivery Log**
- A **Delivery Log** may outlive its **Run** and is always outlived by the **Transcript**
- **Stream** carries a **Run**'s output; **Sync** carries the existence and state of **Threads** and **Runs**
- No fact travels on both channels

## Example dialogue

> **Dev:** "If I close the tab mid-reply, is the **Run** cancelled?"
> **Domain expert:** "No. It becomes a **Detached Run** — still producing, just unwatched. Its **Delivery Log** keeps the output so you can rejoin and see what you missed."
>
> **Dev:** "So on my phone I'd see the reply appear?"
> **Domain expert:** "You'd see over **Sync** that the **Thread** has a **Run** in flight. To watch it arrive you have to attach to the **Stream**. **Sync** tells you a **Run** exists; only the **Stream** tells you what it is saying."
>
> **Dev:** "And once it finishes?"
> **Domain expert:** "It's in the **Transcript** by then. The **Delivery Log** has done its job and is on its way out."

## Flagged ambiguities

- "log" was used for both the **Delivery Log** and the **Transcript** — resolved: these are different records with different lifetimes. The **Delivery Log** is discarded; the **Transcript** is not.
- **Title** was used to mean both a user's name for a **Thread** and a name derived from its **Transcript** — resolved: it is user-owned. Nothing derives it.
- A **Thread** was previously taken to begin existing only once something had been said in it — resolved: it begins existing when it is created. An empty **Thread** is a **Thread**.
