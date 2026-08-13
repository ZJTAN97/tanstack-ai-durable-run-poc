import { useChat } from '@tanstack/ai-react'

import { Composer } from './Composer/Composer'
import classes from './Conversation.module.css'
import { createChatOptions } from './create-chat-options'
import { MessageList } from './MessageList/MessageList'

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
