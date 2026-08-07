/**
 * A fresh conversation identity.
 *
 * Only ever called from an event handler. Called during render it would mint a
 * new id on every mount, which is precisely the bug that makes a conversation
 * unresumable.
 */
export function createThreadId() {
  return `thread-${crypto.randomUUID()}`
}
