# 02 — Mantine SSR shell

**What to build:** Every page in the app renders through Mantine, server-side, with the correct colour scheme on the very first paint. A user who prefers dark mode never sees a flash of light mode, and the browser console reports no hydration mismatch.

This is the document shell: Mantine's stylesheet, the colour-scheme script in the head, the Mantine HTML attributes on the root element, and a single provider wrapping the app. A project theme file exists as the home for design tokens, even if it starts near-empty.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Page renders with Mantine styling applied under SSR, not only after hydration
- [ ] No flash of the wrong colour scheme on load in either light or dark preference
- [ ] Browser console shows no hydration mismatch warnings
- [ ] Exactly one Mantine provider exists in the tree
- [ ] A theme module exists and is the single place design tokens are defined
- [ ] No global stylesheet beyond the theme file and Mantine's own imports
