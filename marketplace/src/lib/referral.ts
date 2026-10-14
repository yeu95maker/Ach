/** Partner referral code carried from /for-providers?ref=CODE to provider sign-up (60 days). */
export const REFERRAL_COOKIE = 'ref'
export const normalizeReferral = (code: string | null | undefined) => {
  const v = (code ?? '').trim().toUpperCase()
  return /^[A-Z0-9-]{3,20}$/.test(v) ? v : null
}
