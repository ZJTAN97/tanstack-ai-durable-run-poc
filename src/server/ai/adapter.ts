import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { env } from '@/server/env'

// The only place in the codebase that names a model. Changing providers or
// models is this line and nothing else.
//
// Ticket 03 specifies qwen/qwen3.7-flash. It is live on OpenRouter but absent
// from @tanstack/ai-openrouter@0.15.11's model union, whose catalogue lags the
// provider — so this pins the previous point release rather than cast past the
// type. Bump it once the package catches up.
export const textAdapter = createOpenRouterText(
  'qwen/qwen3.6-flash',
  env.OPENROUTER_API_KEY,
  {
    httpReferer: env.APP_URL,
    appTitle: 'tanstack-ai-durable-run-poc',
  },
)
