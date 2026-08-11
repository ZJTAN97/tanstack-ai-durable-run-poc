import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import { Markdown } from '@tanstack/markdown/react'

import classes from './MessageMarkdown.module.css'

// Built once. The extension is stateless, so a fresh instance per render would
// buy nothing and cost a reparse of the whole reply on every streamed token.
const STREAMING_EXTENSIONS = [streamingMarkdownExtension()]

/**
 * A model reply, rendered as the Markdown it actually is.
 *
 * The parser is synchronous and deterministic, which is what makes it usable
 * here: the same source produces the same tree on the server and in the browser,
 * so an SSR'd transcript hydrates without a mismatch, and a reply arriving one
 * token at a time can be reparsed on every frame rather than debounced.
 *
 * The streaming extension is the reason a half-typed reply does not flicker. A
 * partial document ends mid-syntax — an `##` with no heading text yet, a list
 * whose last bullet is still empty — and rendering that literally makes the
 * bottom line jump as each character lands. The extension drops that trailing
 * placeholder until the token completing it arrives.
 *
 * Raw HTML in the source is escaped, not rendered: `allowHtml` stays off, so a
 * model that emits a `<script>` tag prints one instead of running one.
 */
export function MessageMarkdown({ source }: { source: string }) {
  return (
    <div className={classes.prose}>
      <Markdown extensions={STREAMING_EXTENSIONS}>{source}</Markdown>
    </div>
  )
}
