# tanstack-ai-durable-run-poc

A proof-of-concept for **TanStack AI durable runs** on **TanStack Start**. The
claim under test: an AI run survives a dropped connection or a page reload — the
client rejoins the same run and replays the events it missed.

See `CLAUDE.md` for the project's standing conventions, and `learnings/` for what
building it actually taught us — the API surface that matters, both Postgres
integration points, the resumable-run lifecycle, and the client/server boundary.

This POC is meant to learn this whole process and figure out how to integrate with WanderNotes.

# Key Learning Docs

- Custom Durability Adapter https://tanstack.com/ai/latest/docs/resumable-streams/custom-adapter