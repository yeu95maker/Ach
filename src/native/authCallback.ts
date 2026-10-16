import { AUTH_CALLBACK } from './platform'

/** Pages an auth deep link may lead to – anything else falls back to '/'. */
const ALLOWED_NEXT = new Set(['/', '/reset-password'])

export type AuthCallback = { code: string | null; next: string; error: string | null }

/** Redirect target for Supabase auth on native: dienstwerk://auth-callback[/path]. */
export function nativeRedirect(path = '/') {
  return path === '/' ? AUTH_CALLBACK : `${AUTH_CALLBACK}${path}`
}

/**
 * Parses dienstwerk://auth-callback/<path>?code=… (PKCE) or ?error=…
 * Returns null for any other URL so foreign links are ignored.
 */
export function parseAuthCallback(url: string): AuthCallback | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'dienstwerk:' || u.hostname !== 'auth-callback') return null
  // Supabase may append the result to the query or (implicit errors) to the hash.
  const params = new URLSearchParams(u.search)
  new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => {
    if (!params.has(k)) params.set(k, v)
  })
  const path = u.pathname.replace(/\/+$/, '') || '/'
  return {
    code: params.get('code'),
    next: ALLOWED_NEXT.has(path) ? path : '/',
    error: params.get('error_description') ?? params.get('error'),
  }
}
