import { defineConfig } from 'drizzle-kit'

// The one place permitted to read the environment directly rather than through
// src/server/env.ts. That module fails on a missing OPENROUTER_API_KEY, and a
// migration has no business needing a model provider key.
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and run `docker compose up -d`.',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema',
  out: './drizzle',
  dbCredentials: { url: databaseUrl },
})
