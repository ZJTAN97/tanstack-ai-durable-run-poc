# Ticket 01 — what the scaffolder actually produced

Generated with:

```
npx @tanstack/cli@latest create durable-run-poc \
  --framework React --blank --toolchain biome \
  --no-examples --no-git --no-intent \
  --package-manager pnpm --no-install --non-interactive
```

Generated in a temp directory outside the repo, audited, then copied in.
`--no-install` was deliberate so the dependency list could be read before
anything was fetched.

Note: `create-start-app` is deprecated in favour of `tanstack create` /
`@tanstack/cli create`. **`--no-tailwind` is now a deprecated no-op** — the only
flag that actually excludes Tailwind is `--blank`. That is the likely cause of
Tailwind being forced in on a previous attempt.

## Installed dependencies (complete)

| Package | Spec | Resolved |
| :--- | :--- | :--- |
| `@tanstack/react-router` | `^1.170.20` | 1.170.20 |
| `@tanstack/react-start` | `^1.168.37` | 1.168.37 |
| `react` | `^19.2.0` | 19.2.8 |
| `react-dom` | `^19.2.0` | 19.2.8 |
| `@biomejs/biome` (dev) | `2.4.5` | 2.4.5 |
| `@types/node` (dev) | `^22.10.2` | 22.20.1 |
| `@types/react` (dev) | `^19.2.0` | 19.2.18 |
| `@types/react-dom` (dev) | `^19.2.0` | 19.2.4 |
| `@vitejs/plugin-react` (dev) | `^6.0.1` | 6.0.5 |
| `typescript` (dev) | `^6.0.2` | 6.0.3 |
| `vite` (dev) | `^8.0.0` | 8.2.0 |

That is the entire direct dependency list — eleven packages.

## Banned-dependency audit

Counted across the whole of `pnpm-lock.yaml`, not just direct dependencies:

| Package | Occurrences | Verdict |
| :--- | :--- | :--- |
| tailwind | 0 | absent |
| `@tanstack/react-query` | 0 | absent |
| axios | 0 | absent |
| vitest / jest / `@testing-library` / playwright / cypress | 0 | absent |
| eslint | 0 | absent |
| **prettier** | **1 (transitive)** | **present — see below** |

`prettier@3.9.6` is pulled transitively by `@tanstack/router-generator`, which
uses it internally to format `routeTree.gen.ts`. It is not a direct dependency,
has no config file and no script. Originally there were two paths to it; removing
the redundant `@tanstack/router-cli` devDependency closed one. The remaining path
runs through `@tanstack/react-start` itself and cannot be removed without
dropping the framework. **Biome remains the only configured linter/formatter.**

## Changes made to the generator's output

| Change | Reason |
| :--- | :--- |
| Pinned `react-router` / `react-start` (were `"latest"`) | A floating spec means two clones get different versions. |
| Dropped the `#/*` alias (package.json `imports` + tsconfig path) | The generator emitted two aliases for one target; `CLAUDE.md` §9 names `@/*` as the alias. |
| `lint` → `biome check`; `format` → `biome format --write` | `CLAUDE.md` §1 documents `pnpm lint` as Biome check; the generator's `biome lint` skipped formatting. |
| Removed dead `pnpm.onlyBuiltDependencies` from package.json | pnpm 11 ignores it and warned on every boot; already present as `allowBuilds` in `pnpm-workspace.yaml`. |
| `biome.json` `$schema` 2.2.4 → 2.4.5 | Mismatched the installed CLI; Biome errored on it. |
| `biome.json` formatter → 2-space, single quotes, semicolons `asNeeded` | The generated config (tabs, double quotes) contradicted the source files the same generator emitted, and `CLAUDE.md`'s samples. **Cosmetic — reverse in one config edit if you prefer tabs.** |
| `biome.json` `includes` broadened to `**` minus generated/vendor | Was `src/**` + `vite.config.ts` only, so root configs were silently unlinted. |
| Added `.gitattributes` (`* text=auto eol=lf`) | `core.autocrlf=true` + Biome's LF default meant a fresh Windows clone would fail `pnpm lint` on line endings alone. |
| `dev` gained `--strictPort` | `CLAUDE.md` §10 pins port 3000; Vite otherwise falls through to 3001 silently. |
| Removed `@tanstack/router-cli`, `tsr.config.json`, `generate-routes` script | Redundant — the Start Vite plugin generates `routeTree.gen.ts` itself (verified by deleting the file and rebuilding). Also closed one prettier path. |
| `__root.tsx`: `../styles.css` → `@/styles.css` | `CLAUDE.md` §9 — the alias for anything outside the current folder. |
| `__root.tsx`: title → "TanStack AI durable run POC" | Was the generator placeholder. |
| `router.tsx`: return the router directly | Assigned to a local and immediately returned it. |
| Rewrote `README.md` | Generator boilerplate described a different project. |

## Verified by running

- `pnpm dev` boots; `http://localhost:3000/` returns **HTTP 200** with fully
  server-rendered HTML containing the page markup.
- `npx tsc --noEmit` — clean.
- `pnpm lint` — clean.
- `pnpm build` — succeeds (client + SSR bundles).
- **`@/*` alias resolves at both layers** — proved with a temporary probe module
  imported through the alias, confirmed present in the SSR output and accepted by
  `tsc`, then removed.
- Vite plugin order: `tanstackStart()` precedes `viteReact()` in `vite.config.ts`.

## NOT verified

- **Browser hydration.** The Chrome extension was not connected, so the page was
  never loaded in a real browser. SSR output is confirmed via curl; client-side
  hydration and console cleanliness are unchecked. Ticket 02 (Mantine SSR) should
  establish this.
- **Production serving.** `dist/server/server.js` exports a `{ fetch }` handler,
  not a listening server — TanStack Start needs a deployment adapter to serve it.
  None is installed, so there is no `pnpm start`. **This contradicts
  `CLAUDE.md` §1, which documents `pnpm build && pnpm start`.** The demo runs on
  `pnpm dev`; add a deployment adapter if production serving is ever needed.

## Known deviations left for later tickets

- `src/styles.css` is a global stylesheet, which `CLAUDE.md` §8 forbids beyond
  `theme.css`. Ticket 02 replaces it as part of Mantine setup.
- `src/routes/index.tsx` defines its component inline rather than in
  `-page/HomePage.tsx` per `CLAUDE.md` §9. Ticket 05 owns the home route.
