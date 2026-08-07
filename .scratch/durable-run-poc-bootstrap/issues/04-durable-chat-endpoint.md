# 04 — Durable chat endpoint: POST starts a run, GET resumes one

**What to build:** The HTTP contract the whole POC rests on. One endpoint with two handlers:

- **POST** starts a run and streams it back over Server-Sent Events, while persisting every chunk to the durability log as it goes. Each event carries a resumable offset.
- **GET** replays an existing run from that log, from a supplied offset, **without re-running the model**.

A POST-only endpoint is not durable. Both handlers are the deliverable.

The endpoint must not know which durability backend is in use — it takes the wrapper from ticket 03 and passes it through.

**This is the tracer bullet, and it is verifiable without an API key.** A resume request that names no offset has nothing to replay and is rejected with `400`. A resume request for a run that does not exist fails loudly rather than hanging open. Those two behaviours prove the durability plumbing is connected before any UI exists.

Worth recording for the reviewer: when durability is wired, a client disconnecting mid-stream does **not** abort the run. The server keeps pulling the model and draining into the log with nobody listening, so a rejoining client can finish the reply. That behaviour is provided by the framework, not implemented here — this ticket's job is to wire it correctly and confirm it.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] POST streams a run and appends every chunk to the durability log
- [ ] Each streamed event carries a resumable offset
- [ ] GET replays a run from an offset without invoking the model
- [ ] A resume request carrying no offset is rejected with `400`
- [ ] A resume request for an unknown run fails loudly and promptly — it does not hang
- [ ] The endpoint contains no reference to the specific durability backend
- [ ] Request input is validated at the boundary
- [ ] The `400` and unknown-run behaviours are demonstrated with a real request and the output recorded in the ticket's completion notes
