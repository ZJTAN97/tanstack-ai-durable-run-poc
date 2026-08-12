import { useParams } from '@tanstack/react-router'

import { threadIdentifier } from '@/schema/thread'

import { InvalidThreadNotice } from '../InvalidThreadNotice/InvalidThreadNotice'
import { ChatHeader } from './ChatHeader/ChatHeader'
import classes from './ChatPage.module.css'
import { Conversation } from './Conversation/Conversation'

export function ChatPage() {
  const threadId = useParams({
    from: '/threads_/$threadId',
    select: (param) => param.threadId,
  })
  const addressedThread = threadIdentifier.safeParse(threadId)

  if (!addressedThread.success) {
    return (
      <InvalidThreadNotice reason={addressedThread.error.issues[0].message} />
    )
  }

  return (
    <div className={classes.shell}>
      <ChatHeader />
      <Conversation
        key={addressedThread.data}
        threadId={addressedThread.data}
      />
    </div>
  )
}
