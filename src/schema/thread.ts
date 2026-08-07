import { z } from 'zod'

/**
 * The conversation every visitor lands in when the URL names none.
 *
 * A constant, deliberately. Minting an id here instead would hand a different
 * conversation to every load — including the reload the POC is trying to
 * survive — and would disagree between the server render and the client one.
 */
export const DEFAULT_THREAD_ID = 'demo-thread'

/**
 * Bounded and URL-safe. Stricter than the run identity `@/schema/chat` accepts,
 * and deliberately so: that schema guards a request body a client composes,
 * whereas this one guards the one place a human types the id by hand. Keeping
 * what the address bar can express to plainly URL-safe characters means the id
 * read off the screen is the id that travels onward, unescaped and unaltered.
 */
const threadIdentifier = z
  .string()
  .min(1)
  .max(64, 'must be at most 64 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'may contain only letters, digits, "-" and "_"')

/**
 * The conversation's identity lives in the URL so that it survives a reload, is
 * shareable, and can be swapped for a clean conversation without clearing
 * browser storage by hand.
 *
 * Absent and malformed are treated differently on purpose. Absent is the
 * ordinary first visit, so it resolves to the default. Malformed is a URL that
 * names a conversation this app cannot address, so it is refused here rather
 * than allowed to reach the page and be silently corrected — a request for
 * thread A that quietly serves thread B is worse than an error.
 *
 * There is no run id here, and none in the route path. A run names one turn and
 * is minted by the server when that turn starts; the chat client tracks it. A
 * route segment for it would mean naming it before it exists.
 */
export const threadSearchSchema = z.object({
  threadId: threadIdentifier.default(DEFAULT_THREAD_ID),
})
