# 01 — Scaffold the TanStack Start app

**What to build:** A running TanStack Start application on port 3000. Someone clones the repo, installs, runs the dev command, and gets a served page in the browser. Nothing else works yet — this ticket exists so every later ticket has a real app to build inside.

Scaffold via the TanStack Start CLI in blank mode with the Biome toolchain, generated outside the repo and copied in so the existing git history and project instructions are untouched.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Dev server boots and serves a page at `http://localhost:3000`
- [ ] Dependency list contains **no Tailwind**, **no TanStack Query**, **no Axios**, and **no test framework** — this has been an explicit failure mode of the scaffolder before, so it is checked and reported rather than assumed
- [ ] Vite plugin order is correct: the Start plugin precedes the React plugin
- [ ] Biome is the only linter/formatter; no ESLint or Prettier present
- [ ] The `@/*` → `src/*` path alias resolves
- [ ] Pre-existing repo files (project instructions, git metadata) are unmodified
- [ ] A written summary of what the scaffolder actually produced, so the stack can be reviewed against the agreed list before anything is built on top
