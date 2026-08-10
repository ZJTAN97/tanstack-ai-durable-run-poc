import { z } from 'zod'

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .min(1, 'required — create a key at https://openrouter.ai/keys'),
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z
    .url()
    .startsWith(
      'postgres',
      'must be a postgres:// or postgresql:// connection string',
    ),
  // How long a *finished* run stays replayable from its delivery log. Short by
  // default because the log is a transport buffer, not a record: the transcript
  // outlives it in `chat_messages`. Set it above the longest gap you expect
  // between a run ending and a dropped client coming back for its tail — past
  // that, the rejoin fails rather than replaying.
  DELIVERY_LOG_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
})

const parsedEnvironment = environmentSchema.safeParse(process.env)

// Thrown at import time so a misconfigured server dies at boot with the list of
// what is wrong, rather than on the first chat request with a provider 401.
if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid environment:\n\n${z.prettifyError(parsedEnvironment.error)}\n\nCopy .env.example to .env and fill in the values.`,
  )
}

export const env = parsedEnvironment.data
