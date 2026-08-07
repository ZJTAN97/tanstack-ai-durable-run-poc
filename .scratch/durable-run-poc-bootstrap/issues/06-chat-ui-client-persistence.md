# 06 — Chat UI with client persistence

**What to build:** A working conversation on the page. A user types a message, sends it, and watches the reply stream in. They reload the page and the conversation is still there. If they reload **while a reply is still streaming**, the client rejoins that same run and the reply finishes — it does not restart, and it does not silently truncate.

Three behaviours make that work, and all three are required:

1. **The chat hook** wired to the durable endpoint from ticket 04, with the thread id from ticket 05 as its identity.
2. **Browser-side persistence**, which stores the transcript and — critically — the pointer to any run still in flight. Delivery durability alone gives a resumable log that the client forgets about the moment the page reloads. Persistence alone repaints a transcript but cannot finish an interrupted reply. The POC's claim needs both.
3. **A one-click preset** that starts a deliberately long run, so the mid-stream reload window is wide and repeatable. Testing durability by typing fast and hoping is not a test.

Message content is rendered by **part type**, never assumed to be a plain string — a message may carry text, reasoning, or tool-call parts.

**Do not write an effect to rejoin the run.** The chat client already owns rejoining: it reads the persisted resume pointer on mount, reattaches, and replays the log. Hand-wiring a stream in an effect duplicates machinery that exists and will fight it. This ticket should introduce **zero** effects.

Scope note: a second tab is **out of scope**. Browser storage is shared across tabs, so a second tab will find the pointer and appear to work, but two chat clients would then tail one run through uncoordinated connections. That case is deferred to server-authoritative persistence and is not claimed.

**This is the first ticket that needs a real API key to exercise.**

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Sending a message streams a reply into the page
- [ ] Reloading after a reply completes restores the transcript
- [ ] Reloading **mid-stream** rejoins the same run and the reply finishes
- [ ] A one-click preset reliably starts a run long enough to reload during
- [ ] Message parts are rendered by type; no part type crashes the page
- [ ] Zero `useEffect` calls introduced
- [ ] Each component in its own file, following the folder-per-component convention
- [ ] Layout built from Mantine components and props; no inline styles for static styling
