# tanstack-ai-durable-run-poc

A proof-of-concept for **TanStack AI durable runs** on **TanStack Start**. The
claim under test: an AI run survives a dropped connection or a page reload — the
client rejoins the same run and replays the events it missed.

See `CLAUDE.md` for the project's standing conventions.

## Requirements

- Node 24+
- pnpm 11+

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # Biome check (lint + format)
pnpm lint --write # auto-fix
pnpm build        # production build into dist/
```

## Production serving

`pnpm build` emits `dist/server/server.js`, which exports a Web-standard
`{ fetch }` handler rather than a listening server. Serving it needs a TanStack
Start deployment adapter (nitro, cloudflare, netlify, railway), which this POC
does not install — the demo runs on `pnpm dev`.

## Routing

Routes are files under `src/routes/`. The Start Vite plugin regenerates
`src/routeTree.gen.ts` on dev and build; never edit it by hand.
