import { z } from 'zod'

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .min(1, 'required — create a key at https://openrouter.ai/keys'),
  APP_URL: z.url().default('http://localhost:3000'),
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
