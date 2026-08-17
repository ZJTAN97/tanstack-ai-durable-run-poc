import { base64url, jwtVerify, SignJWT } from 'jose'

import { env } from '@/server/env'

/**
 * Every device in this POC resolves to the same subject, so every device sees
 * every thread. The `user_id` column and the bucket keyed on it make the shape
 * right; they do not make the POC multi-tenant. Replacing this constant with a
 * real identity is a Clerk drop-in at `fetchCredentials` plus a `jwks_uri` in
 * powersync/service.yaml — the sync rules read `sub` and nothing else, so
 * nothing downstream of the token changes.
 */
export const ANONYMOUS_SUBJECT = 'anonymous'

/** Matches `client_auth.audience` in powersync/service.yaml. */
const AUDIENCE = 'powersync'

/**
 * Short enough that a leaked token is not a standing grant, long enough that the
 * client is not re-minting one mid-session. The SDK refreshes on expiry.
 */
const LIFETIME = '5m'

// Base64url in, raw bytes out — the same bytes the sync service derives from the
// `k` of its inline JWK, which is the whole point of storing the secret encoded.
const signingKey = base64url.decode(env.POWERSYNC_JWT_SECRET)

export function issueSyncToken() {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid: 'durable-run-poc' })
    .setSubject(ANONYMOUS_SUBJECT)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(LIFETIME)
    .sign(signingKey)
}

/**
 * Who a request is, according to the token it presents — or null when it
 * presents none the service would have accepted either.
 *
 * The upload endpoint verifies with the same key the sync service does rather
 * than trusting a body field, which is what makes ownership something a client
 * cannot state about itself.
 */
export async function readTokenSubject(request: Request) {
  const header = request.headers.get('authorization')
  if (header === null || !header.startsWith('Bearer ')) return null

  try {
    const { payload } = await jwtVerify(header.slice(7), signingKey, {
      audience: AUDIENCE,
    })
    return payload.sub ?? null
  } catch {
    return null
  }
}
