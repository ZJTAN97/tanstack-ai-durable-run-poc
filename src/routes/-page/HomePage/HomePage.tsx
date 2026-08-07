import { getRouteApi } from '@tanstack/react-router'

import { ChatHeader } from './ChatHeader/ChatHeader'
import { Conversation } from './Conversation/Conversation'
import classes from './HomePage.module.css'

// Read through the route api rather than importing the route: the route already
// imports this component, and importing it back would close the cycle.
const homeRoute = getRouteApi('/')

export function HomePage() {
  const { threadId } = homeRoute.useSearch()

  return (
    <div className={classes.shell}>
      <ChatHeader />

      {/* Keyed on the thread id so switching conversations builds a fresh
          chat client against the new one, rather than carrying the previous
          conversation's transcript into it. */}
      <Conversation key={threadId} threadId={threadId} />
    </div>
  )
}
