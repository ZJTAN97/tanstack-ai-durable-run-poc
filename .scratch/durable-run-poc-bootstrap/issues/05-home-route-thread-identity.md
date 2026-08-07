# 05 — Home route with thread identity in the URL

**What to build:** The single page the POC lives on, at `/`, with the conversation's identity carried in the URL as a validated search parameter.

A conversation's identity is its **thread id**. It must be stable across reloads and must never be randomised per mount, or every load starts a new conversation and nothing can be resumed. Putting it in the URL means it survives a reload, is shareable, and — during the durability demo — gives a one-click way to start a clean conversation without clearing browser storage by hand.

Deliberately **not** a run id in the route path. A run id names one turn, is minted by the server when a run starts, and is tracked by the chat client itself. A route segment for it would mean naming something before it exists.

The route file holds the route definition only — loader, component, error and pending states. The page implementation lives beside it in a non-routable directory, following the project's co-location conventions with a folder per component.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `/` renders the page shell
- [ ] The thread id is read from a validated search parameter and survives a reload
- [ ] A missing parameter resolves to a stable default rather than erroring
- [ ] A malformed parameter is rejected by validation rather than reaching the page
- [ ] Changing the parameter in the address bar yields a distinct conversation identity
- [ ] Route definition and page implementation are separate; page components follow the folder-per-component convention
- [ ] No run id appears in the route path
