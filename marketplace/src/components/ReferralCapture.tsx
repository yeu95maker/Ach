'use client'
import { useEffect } from 'react'
import { REFERRAL_COOKIE } from '@/lib/referral'

/** Remembers the partner code from the landing-page link until the provider profile is created. */
export function ReferralCapture({ code }: { code: string | null }) {
  useEffect(() => {
    if (code) document.cookie = `${REFERRAL_COOKIE}=${code}; path=/; max-age=${60 * 86400}; samesite=lax`
  }, [code])
  return null
}
