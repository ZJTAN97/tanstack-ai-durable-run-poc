import { getRouteApi } from '@tanstack/react-router'

import { threadIdentifier } from '@/schema/thread'

import { InvalidThreadNotice } from '../InvalidThreadNotice/InvalidThreadNotice'
import { ChatHeader } from './ChatHeader/ChatHeader'
import classes from './ChatPage.module.css'
import { Conversation } from './Conversation/Conversation'

// Read through the route api rather than importing the route: the route already
// imports this component, and importing it back would close the cycle.
const chatRoute = getRouteApi('/threads_/$threadId')

export function ChatPage() {
  const { threadId } = chatRoute.useParams()
  const addressedThread = threadIdentifier.safeParse(threadId)

  // Judged here during render rather than thrown from a `params.parse`, so the
  // refusal is ordinary rendering on both sides of hydration rather than a
  // router error object that has to survive serialisation to be recognised.
  if (!addressedThread.success) {
    return (
      <InvalidThreadNotice reason={addressedThread.error.issues[0].message} />
    )
  }

  return (
    <div className={classes.shell}>
      <ChatHeader />

      {/* Keyed on the thread id so switching conversations builds a fresh
          chat client against the new one, rather than carrying the previous
          conversation's transcript into it. */}
      <Conversation
        key={addressedThread.data}
        threadId={addressedThread.data}
      />
    </div>
  )
}
