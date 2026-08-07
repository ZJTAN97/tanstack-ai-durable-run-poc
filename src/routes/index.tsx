import { createFileRoute } from '@tanstack/react-router'

import { threadSearchSchema } from '@/schema/thread'

import { HomePage } from './-page/HomePage/HomePage'
import { InvalidThreadNotice } from './-page/InvalidThreadNotice/InvalidThreadNotice'

export const Route = createFileRoute('/')({
  validateSearch: threadSearchSchema,
  component: HomePage,
  errorComponent: InvalidThreadNotice,
})
