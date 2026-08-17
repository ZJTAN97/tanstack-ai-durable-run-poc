import { z } from 'zod'

/**
 * Bounded and URL-safe. Stricter than the run identity the durable-run log
 * accepts, and deliberately so: that one guards ids a client composes and sends,
 * whereas this one guards the one place a human types the id by hand. Keeping
 * what the address bar can express to plainly URL-safe characters means the id
 * read off the screen is the id that travels onward, unescaped and unaltered.
 *
 * The conversation's identity lives in the URL — as the `$threadId` path segment
 * — so that it survives a reload, is shareable, and can be swapped for a clean
 * conversation without clearing browser storage by hand.
 *
 * An id this rejects is refused rather than silently corrected: a request for
 * thread A that quietly serves thread B is worse than an error. An id this
 * *accepts* but that names no stored conversation is still not an error — a
 * device that has not synced a thread can be addressed at it, and starting a new
 * chat writes the row locally before the server has heard of it either way.
 *
 * There is no run id here, and none in the route path. A run names one turn and
 * is minted by the server when that turn starts; the chat client tracks it. A
 * route segment for it would mean naming it before it exists.
 */
export const threadIdentifier = z
  .string()
  .min(1)
  .max(64, 'must be at most 64 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'may contain only letters, digits, "-" and "_"')
