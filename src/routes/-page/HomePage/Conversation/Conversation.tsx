import { useChat } from '@tanstack/ai-react'

import { Composer } from './Composer/Composer'
import classes from './Conversation.module.css'
import { createChatOptions } from './create-chat-options'
import { MessageList } from './MessageList/MessageList'

/**
 * The conversation, and the two things that make it survive a reload.
 *
 * Delivery durability (ticket 04) keeps the run going server-side and keeps a
 * log of it that can be replayed. Server-authoritative persistence (ticket 10)
 * holds the transcript and answers which run is still going. Either alone fails
 * the test: durability without the pointer gives a resumable log that the
 * reloaded page has forgotten the name of, and a transcript without durability
 * repaints a reply that can never finish.
 *
 * None of that is on screen any more, by design: this reads as a chat app, and
 * the machinery is only visible in that a mid-stream reload finishes its reply.
 * The test procedure lives in the README.
 *
 * There is no effect here rejoining the run, deliberately. `useChat` hydrates
 * from the server as it constructs its client and tails the live run itself. A
 * hand-wired stream would be a second consumer of the same run, racing the one
 * that already exists.
 */
export function Conversation({ threadId }: { threadId: string }) {
  const { messages, sendMessage, stop, isLoading, error } = useChat(
    createChatOptions(threadId),
  )

  return (
    <div className={classes.root}>
      <MessageList messages={messages} error={error} isGenerating={isLoading} />
      <Composer onSend={sendMessage} isBusy={isLoading} onStop={stop} />
    </div>
  )
}
