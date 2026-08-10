import { defineChatMiddleware } from '@tanstack/ai'
import { chatPersistence } from '@/server/ai/chat-persistence'

/**
 * Restores reasoning to the stored transcript.
 *
 * `withPersistence` synthesises the run's terminal assistant turn from
 * `FinishInfo`, which carries text and nothing else — so the `thinking` field
 * `ModelMessage` defines is left empty on the one message of a run the engine
 * does not append to `ctx.messages` itself. Tool-call turns are unaffected: the
 * engine attaches their reasoning already.
 *
 * The patch goes through the message store rather than a targeted UPDATE, so
 * this module stays ignorant of which backend holds the transcript — the same
 * seam `api.chat.ts` keeps around the delivery log.
 *
 * This must sit AFTER `withPersistence` in the middleware array. `onFinish`
 * hooks run in array order, and the row has to exist before it can be patched.
 *
 * ASSUMES ONE REASONING BLOCK PER RUN, which holds only while this POC has no
 * tools. With tools, each iteration's reasoning is already persisted on that
 * iteration's tool-call message, and this buffer would re-attach it to the
 * final turn as a duplicate — it would need to keep only the last iteration's.
 */
type RunReasoning = { messageId?: string; content: string }

// Keyed on the middleware context, which is one stable object per run: a
// module-level buffer would cross-contaminate concurrent runs, and a Map would
// leak the entry of any run that ends without reaching `onFinish`.
const reasoningByRun = new WeakMap<object, RunReasoning>()

export const withThinkingPersistence = defineChatMiddleware({
  name: 'thinking-persistence',

  onStart(context) {
    reasoningByRun.set(context, { content: '' })
  },

  // Observation only — every branch returns void, so no chunk is altered.
  onChunk(context, chunk) {
    const reasoning = reasoningByRun.get(context)
    if (!reasoning) return

    // The stored message is keyed by the TEXT message's id, which is a
    // different id from the reasoning message's and arrives after it.
    if (chunk.type === 'TEXT_MESSAGE_START') {
      reasoning.messageId = chunk.messageId
    }
    if (chunk.type === 'REASONING_MESSAGE_CONTENT') {
      reasoning.content += chunk.delta
    }
  },

  async onFinish(context) {
    const reasoning = reasoningByRun.get(context)
    if (!reasoning?.messageId || reasoning.content === '') return

    const { messages } = chatPersistence.stores
    const transcript = await messages.loadThread(context.threadId)
    const targetMessageId = reasoning.messageId

    // A save is a full overwrite, so patching a message that is no longer in
    // the thread would rewrite the whole thread to no effect.
    const hasTarget = transcript.some(
      (message) => message.id === targetMessageId,
    )
    if (!hasTarget) return

    await messages.saveThread(
      context.threadId,
      transcript.map((message) =>
        message.id === targetMessageId
          ? { ...message, thinking: [{ content: reasoning.content }] }
          : message,
      ),
    )
  },
})
