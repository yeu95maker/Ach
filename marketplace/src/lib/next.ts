/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | string[] | null | undefined, fallback = '/'): string {
  const v = Array.isArray(next) ? next[0] : next
  return v && v.startsWith('/') && !v.startsWith('//') ? v : fallback
}
