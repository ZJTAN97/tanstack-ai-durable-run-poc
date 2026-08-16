# Threads carry tenancy; Runs do not

**Sync** replicates per user, so something must say which user a row belongs to. We put that on the **Thread** only: a sync bucket is resolved per **Thread** from the **Thread**'s owner, and **Run** rows are replicated by virtue of belonging to a **Thread** already in the bucket. A **Run** has no owner of its own.

## Considered options

**Owner on both Threads and Runs.** Rejected. **Run** rows are created by the chat library's own persistence store, which is handed a run id, a thread id, a status and a start time — and no user. Putting an owner on a **Run** means threading identity through the chat request and into a store implementation the library owns, to populate a column nothing reads. That we did *not* have to modify the durable-run implementation to make **Sync** work is a result worth preserving, not spending.

## Consequences

- A **Run**'s owner is only ever knowable through its **Thread**. Anything asking "whose run is this" must go via the **Thread**, and there is no shortcut column to reach for.
- Buckets are per **Thread** rather than per user, which leaves the door open to replicating only the **Threads** a device has actually opened.
- Ownership is stamped server-side when a **Thread** is created. A device never states who it is; it only presents a token, and the server decides what that means.
