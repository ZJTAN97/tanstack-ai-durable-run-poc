# 08 — Chat UI revamp: a conversation that looks like a chat app

## Problem Statement

The page a user lands on does not look or behave like a chat application. It looks like an instrument panel that happens to contain a chat box.

Concretely, from the user's side:

- The page opens with a title, a paragraph of explanation about durable runs, a "Thread id" card with a monospace identifier, and a "Durability test" card telling them to reload the page mid-stream. The message box is the fourth thing down.
- The transcript sits inside a bordered card between two divider lines, and the card grows with the conversation. The composer is attached to the bottom of that card, so it walks off the bottom of the viewport as the conversation gets longer. To send a second message the user has to scroll down to find the box they just used.
- Nothing follows the reply as it streams. Text is appended below the fold and the user has to keep scrolling by hand to read a reply that is still being written.
- Both roles are rendered as the same object: a bordered, tinted panel with a small "You" / "Assistant" caption and an indent on one side. Scanning the transcript for "what did I ask" against "what did it say" takes reading, not glancing.
- Reasoning output is rendered in full, italic, inline, at the same weight as the answer, so a model that thinks at length buries the answer it eventually produces.
- The page's vocabulary is the POC's internal vocabulary — "run", "run id", "thread id", "durability test", "no run in flight". A person who came to talk to a model is being shown the test rig.

## Solution

Turn the page into an ordinary chat application, of the shape everyone already knows from ChatGPT and Claude.

The user arrives at a full-height chat surface: a thin header with the app name and a "New chat" action, a centred greeting when the conversation is empty, and a message box pinned to the bottom of the viewport. They type, press Enter, and their message appears as a tinted bubble on the right. The reply flows in below it as full-width plain text on the left with no bubble around it, and the view follows it down as it is written — unless the user has scrolled up to re-read something, in which case the view stays put and offers a way back to the bottom.

While a reply is generating, the send control becomes a stop control. If a reply fails, the error appears in the transcript where the reply would have been, not as a banner above the whole page. If the model reasons before answering, that reasoning is collapsed behind a "Thought process" disclosure so the answer is what the user sees first. Tool activity, if any ever appears, is a compact chip rather than a wall of JSON.

The durability apparatus comes off the page: the long-run preset card, the run status badge and run id readout, the thread id card, and the explanatory header blurb. Durability itself is untouched — the endpoint, the persistence, the run rejoining on reload all keep working exactly as they do now, and a mid-stream reload still finishes its reply. It simply stops being the subject of the user interface.

## User Stories

1. As a visitor, I want the page to open on a chat surface rather than an explanation of the project, so that I understand immediately that I can type something.
2. As a visitor to an empty conversation, I want a short centred greeting where the transcript will be, so that the page does not look broken before I have said anything.
3. As a user, I want the message box pinned to the bottom of the viewport, so that I can send a follow-up without scrolling to find it.
4. As a user, I want the transcript to scroll independently above the message box, so that the composer never moves as the conversation grows.
5. As a user, I want my own messages rendered as a tinted bubble aligned to the right, so that I can pick out my own turns at a glance.
6. As a user, I want assistant replies rendered as full-width plain text on the left with no bubble, so that long answers are comfortable to read rather than squeezed into a box.
7. As a user, I want to send with Enter and insert a newline with Shift+Enter, so that the keyboard behaves the way it does in every other chat app.
8. As a user, I want the composer to grow with my draft up to a limit and then scroll internally, so that a long message is visible while I write it without eating the whole screen.
9. As a user, I want the send control disabled while my draft is empty or only whitespace, so that I cannot send nothing.
10. As a user, I want my draft cleared the moment it is sent, so that I do not accidentally send it twice.
11. As a user, I want the view to follow the reply as it streams, so that I can read a long answer without scrolling by hand.
12. As a user who has scrolled up mid-reply, I want the view to stay where I put it, so that the app does not yank me away from what I am reading.
13. As a user who has scrolled up, I want a visible way to return to the newest message, so that I am not stranded in the middle of a long transcript.
14. As a user, I want to see that a reply is on its way before its first characters arrive, so that I know my message was received.
15. As a user, I want the send control to become a stop control while a reply is generating, so that I can cut off an answer that has gone the wrong way.
16. As a user, I want a stopped reply to remain in the transcript as far as it got, so that stopping does not discard what was already useful.
17. As a user, I want to be prevented from sending a second message while a reply is still generating, so that I do not start two runs at once.
18. As a user whose reply failed, I want the failure shown in the transcript where the reply would have been, so that I can see which turn failed rather than a banner detached from it.
19. As a user, I want a failure message written in plain language, so that I know whether to retry or whether something is misconfigured.
20. As a user reading a model that reasons before answering, I want the reasoning collapsed by default behind a labelled disclosure, so that the answer is the first thing I see.
21. As a curious user, I want to expand that reasoning, so that I can inspect how the answer was arrived at when I care to.
22. As a user, I want tool activity shown as a compact labelled chip rather than raw arguments, so that the transcript stays readable when a tool is involved.
23. As a user, I want any message part this app has never seen to degrade to a small neutral label, so that an unexpected part type never blanks the page mid-reply.
24. As a user, I want the model's own line breaks and lists preserved, so that a numbered answer reads as a numbered answer.
25. As a user, I want very long unbroken strings such as URLs to wrap instead of widening the page, so that the layout never scrolls sideways.
26. As a user, I want a "New chat" action in the header, so that I can start a clean conversation without editing the address bar or clearing browser storage.
27. As a user who starts a new chat, I want the transcript to empty and the composer to focus, so that I can begin typing straight away.
28. As a user, I want a reload to bring my conversation back exactly as it was, so that I do not lose a conversation by refreshing.
29. As a user who reloads while a reply is still being written, I want that reply to carry on to completion, so that a refresh never costs me an answer. *(Behaviour preserved from earlier work — this revamp must not break it.)*
30. As a user, I want the durability machinery to be invisible when it is working, so that the page reads as a chat app and not as a test harness.
31. As a user who shares the page URL, I want the recipient to land in the same conversation, so that the address bar still identifies the conversation even though no card announces it.
32. As a user on a narrow screen, I want the transcript and composer to fill the width comfortably, so that the app is usable on a phone-sized viewport.
33. As a user in dark mode, I want the bubble tint, header, and composer surface to be legible, so that the app is usable in either colour scheme.
34. As a user who prefers reduced motion, I want scroll-following and any transition to respect that preference, so that the interface does not induce discomfort.
35. As a keyboard user, I want the composer, send/stop control, reasoning disclosure, and "New chat" action to be reachable and operable by keyboard, so that I can use the app without a pointer.
36. As a screen-reader user, I want each turn announced with its role, so that I can tell who said what.
37. As a returning user, I want the page to render server-side without a flash of the wrong colour scheme or an empty transcript that jumps, so that arriving feels settled.

## Implementation Decisions

**Seams.** The single seam is `Conversation` — the component that takes a `threadId` and owns everything below it: the chat client, the transcript, the composer, and the scroll behaviour. Everything in this spec happens at or below that seam; nothing above it changes except the page shell that hosts it. No new seam is introduced. The existing page-level split (route definition → page implementation → conversation) stays exactly as it is.

**Modules removed.** The long-run preset component and its prompt constant, the run status component, and the thread identity card are deleted outright, along with their imports. Nothing else may reference them afterwards; leaving one as dead code is not acceptable.

**Modules modified.**

- The **home page shell** loses its title block and explanatory paragraph. It becomes a full-height layout: a thin header row, and a flexible region filled by the conversation. It keeps reading `threadId` from validated search params and keeps keying the conversation on it so that switching conversations builds a fresh client rather than carrying a transcript across.
- The **header** is new and page-local. It carries the app name and the "New chat" action. "New chat" is a router navigation that mints a fresh thread id into the search params — the same mechanism the thread identity card used, relocated. The identifier itself is not displayed.
- **Conversation** keeps its current responsibility — construct the chat client from the thread id, hand `messages` down and `sendMessage`/`stop` along — and drops the card/divider chrome, the preset, the status row, and the page-level error alert. It becomes a two-part layout: scrollable transcript, pinned composer.
- The **message list** owns the scroll container and the stick-to-bottom behaviour, and renders the empty state as a centred greeting.
- The **message bubble** splits its rendering by role rather than styling one shape two ways: user turns are a tinted, right-aligned, max-width bubble; assistant turns are full-width, untinted, left-aligned, with no border. The role caption is dropped as a visible label — alignment and tint carry it — and the role is exposed to assistive technology instead.
- The **message part view** keeps its switch over `part.type` and its unknown-type fallback. Text is unchanged. Reasoning moves inside a collapsed disclosure. Tool call and tool result collapse to a compact chip with the payload available on expansion rather than always printed.
- The **composer** keeps its current send semantics and key handling and changes shape: it becomes the pinned bottom bar, with the send control rendered as an icon button inside the input surface, swapping to a stop control while a reply is generating.

**Error handling.** The chat hook's `error` stops being rendered as a page-level alert and is rendered as a failed-turn item at the end of the transcript. Whether that is a distinct list item or a variant of the assistant turn is left to implementation; what matters is that it sits where the reply would have been.

**Scroll behaviour. This ticket introduces zero effects, exactly as ticket 06 did.** Sticking the transcript to the bottom does not need one:

- **Whether the user is near the bottom** is derived from a scroll handler on the container — plain state updated by an event.
- **The scroll itself** is a `ResizeObserver` on the transcript's content wrapper, attached through a **ref callback that returns its cleanup**. React 19 ref cleanup is what makes this effect-free: the callback runs when the node is attached and the returned function runs when it detaches, with no dependency array to keep honest. The observer fires on every size change, which covers both a new turn mounting *and* an existing reply growing mid-stream — a ref on the last message would only catch the former, because streaming appends into a node that is already mounted.
- **`requestAnimationFrame` inside the observer callback**, coalescing a burst of streaming chunks into one scroll write per frame rather than one per chunk. Cancel any pending frame in the cleanup.
- The observer scrolls the container only when the near-bottom flag is set, so a user who has scrolled up to re-read is never yanked back down.
- **CSS-only fallback, if the observer proves unnecessary:** a `flex-direction: column-reverse` container pins to the bottom and holds position on scroll-up with no JavaScript at all. It is not the default here because it requires newest-first DOM order, which makes screen readers and tab order traverse the conversation backwards — that trades user story 36 away for user story 11. Take it only if the a11y cost is accepted explicitly.
- **Not recommended:** the `overflow-anchor` sentinel technique. It is the most elegant of the three and gives the scrolled-up behaviour for free, but WebKit has not shipped scroll anchoring, so Safari would get no stickiness. Verify current support before reconsidering.
- The existing prohibition stands unchanged: **no effect, and no ref callback either, may rejoin or tail the run.** The chat client already owns that.

**Durability, unchanged.** The chat options module, the endpoint, the durability adapter, the browser persistence, and the thread search schema are all untouched. The client still carries the resume pointer, still rejoins mid-flight runs on mount, and a mid-stream reload must still finish its reply after this change. Removing the *display* of durability must not remove durability.

**Styling.** Mantine components and props first, CSS Modules for anything they cannot express, design tokens only — no hardcoded px or hex, no inline styles for static styling. Light and dark must both be defined for every custom colour. The transcript's viewport-height layout uses Mantine's layout components and CSS Modules rather than measured pixel values.

**Structure.** One component per file, folder-per-component, no barrel files, page-local components stay under the page folder, hooks in `hooks/use-<behaviour>.ts`, path alias for anything outside the current folder.

## Testing Decisions

This project has no test suite by deliberate decision, and this spec does not introduce one. Verification is by running the application, which is the project's stated method.

What makes a good check here is the same thing that makes a good test: it observes behaviour a user could observe, at the seam, and never reaches for internal structure. Every item below is expressed as something visible on screen.

**Verified by running the app:**

1. An empty conversation shows the centred greeting, and the composer sits at the bottom of the viewport with nothing below it.
2. Sending a message puts a right-aligned tinted bubble in the transcript and clears the draft.
3. The reply streams in as left-aligned full-width text, and the view follows it to the bottom without manual scrolling.
4. Scrolling up mid-reply holds position; the return-to-latest affordance appears; using it resumes following.
5. The send control becomes a stop control while generating; stopping leaves the partial reply in place and re-enables sending.
6. A conversation long enough to overflow the viewport keeps the composer fixed and scrolls only the transcript.
7. A reply carrying reasoning shows the answer first, with the reasoning collapsed and expandable.
8. **The durability regression check, and the one that matters most:** start a long reply, reload the page while it is still being written, and confirm the reply carries on to completion rather than restarting or truncating. Since the run id is no longer displayed, this is confirmed by watching the reply resume mid-sentence and finish, and — if a stronger check is wanted — by observing the network calls the page makes on reload.
9. Reloading after a reply has completed restores the transcript.
10. "New chat" empties the transcript, changes the URL, and a reload of the new URL stays in the empty conversation.
11. The app is usable at a phone-width viewport and in dark mode.
12. Lint and typecheck pass.

**Prior art:** ticket 06 and ticket 07 both verified by running the app against a real API key, and ticket 07 established the mid-stream-reload procedure. That procedure is the regression check above; only its evidence changes, since the run id readout it relied on is being removed.

## Out of Scope

- Markdown rendering of assistant output. Replies keep their line breaks via pre-wrap as they do today; no Markdown or syntax-highlighting dependency is added here.
- Streaming a second conversation, a conversation list, a sidebar, or any thread switcher beyond "New chat".
- Server-side persistence of the transcript. The browser remains the store, exactly as it is now.
- Message editing, regeneration, retry, copy-to-clipboard, or per-message actions of any kind.
- Attachments, images, voice, and any non-text input.
- Tools. The part renderer must handle tool parts without breaking, but no tool is defined or wired.
- Any change to the endpoint, the durability adapter, the run identity schemas, or the choice of durability backend. The in-memory backend stays in place; replacing it with Postgres is separate work.
- Multi-tab coordination, which remains explicitly unclaimed.
- Authentication, rate limiting, and model selection.
- A test framework.

## Further Notes

**One tension worth stating plainly, since it is a decision and not an oversight.** The project instructions require that a durable run be demonstrable and that the active durability backend be stated plainly in the demo — precisely so the POC cannot over-claim by omission — and ticket 07 exists to build the panel that makes the claim falsifiable. This spec removes the surfaces that panel was to be built from. The instruction was to make the page a chat app, and it is being followed as given. The consequence is that after this change **the POC's central claim is no longer visible in the product**: a resumed run and a silently re-run one look identical on screen.

That is recoverable and should be recovered deliberately, not accidentally. Options, in rough order of intrusion: keep the durability readout behind a debug toggle or a query parameter; move it to a separate diagnostics route; or state the procedure and the backend in the README only. Ticket 07 should be re-read and re-scoped in light of whichever is chosen rather than quietly abandoned. Whoever picks this up should confirm the intent before deleting the run status component, because the deletion is easy and the evidence is not.

**Three smaller notes.** The stick-to-bottom mechanism above should be checked against the streaming case specifically, not just the new-message case — a `ResizeObserver` that never fires mid-reply, or a `rAF` that is cancelled by the next chunk before it runs, both look correct until a long reply is streamed. The thread identity card carried the only in-product explanation of how to address a different conversation; once it is gone, the URL parameter is undocumented in the UI, so the README should carry it. And the empty-state copy currently instructs the user to start a long run and reload mid-stream — that text is part of the test rig and is replaced by the greeting, not translated.
