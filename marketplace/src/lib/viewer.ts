/** Anonymous, random per-browser key so property views are counted once per day. */
export function viewerKey(): string {
  try {
    let key = localStorage.getItem('viewer-key')
    if (!key) {
      key = crypto.randomUUID()
      localStorage.setItem('viewer-key', key)
    }
    return key
  } catch {
    return crypto.randomUUID()
  }
}
