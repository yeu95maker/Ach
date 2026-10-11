'use client'
import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'
import { Alert, Button } from './ui'

interface Props {
  mode: 'demo' | 'none' | 'provider'
  signedIn: boolean
  isPremium: boolean
  cancelAtPeriodEnd: boolean
  prices: { month: number; year: number; currency: string }
  next: string
}

export function MembershipActions({ mode, signedIn, isPremium, cancelAtPeriodEnd, prices, next }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month')
  const [busy, setBusy] = useState(false)
  const supabase = supabaseBrowser()

  async function run(fn: () => PromiseLike<{ error: unknown }>, done: string, then?: string) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: done, tone: 'success' })
    if (then) router.push(then)
    router.refresh()
  }

  if (!signedIn) {
    return <Button block size="lg" variant="premium" onClick={() => router.push(`/signup?next=${encodeURIComponent(`/membership?next=${next}`)}`)}>{t('premium.becomeMember')}</Button>
  }

  if (isPremium) {
    return cancelAtPeriodEnd ? (
      <Button block variant="secondary" disabled={busy} onClick={() => run(() => supabase.rpc('resume_membership'), t('membership.resumed'))}>{t('membership.resume')}</Button>
    ) : (
      <Button block variant="secondary" disabled={busy} onClick={() => {
        if (window.confirm(t('membership.cancelConfirm'))) void run(() => supabase.rpc('cancel_membership'), t('membership.canceled'))
      }}>{t('membership.cancel')}</Button>
    )
  }

  const yearlySaving = Math.round(100 - (prices.year / (prices.month * 12)) * 100)
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('membership.interval')} className="grid grid-cols-2 gap-2">
        {(['month', 'year'] as const).map((i) => (
          <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setBillingInterval(i)}
            className={clsx('rounded-xl p-3 text-left ring-2', interval === i ? 'bg-gold-100/60 ring-gold-500' : 'bg-white ring-gray-200')}>
            <span className="block text-sm font-semibold text-gray-600">{t(i === 'month' ? 'membership.monthly' : 'membership.yearly')}</span>
            <span className="block text-xl font-extrabold text-gray-900">{formatPrice(i === 'month' ? prices.month : prices.year, prices.currency, locale)}</span>
            {i === 'year' && yearlySaving > 0 && <span className="text-xs font-bold text-brand-700">{t('membership.save', { n: yearlySaving })}</span>}
          </button>
        ))}
      </div>
      {mode === 'none' ? (
        <Alert tone="info">{t('membership.comingSoon')}</Alert>
      ) : (
        <Button block size="lg" variant="premium" disabled={busy}
          onClick={() => mode === 'demo'
            ? run(() => supabase.rpc('billing_demo_checkout', { p_interval: interval }), t('membership.welcome'), next)
            : toast({ text: t('membership.comingSoon') })}>
          {t('premium.becomeMember')}
        </Button>
      )}
      {mode === 'demo' && <p className="text-center text-xs text-gray-500">{t('membership.demoNote')}</p>}
    </div>
  )
}
