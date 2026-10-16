'use client'
import clsx from 'clsx'
import { CreditCard, Loader2, Smartphone } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { errorKey } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'
import { Alert, Button, Field, Input } from './ui'

type Method = 'ecocash' | 'onemoney' | 'web'

interface Props {
  /** app = inside the iOS/Android app: the store rules don't allow selling Premium there. */
  mode: 'paynow' | 'demo' | 'none' | 'app'
  signedIn: boolean
  isPremium: boolean
  autoRenew: boolean
  cancelAtPeriodEnd: boolean
  prices: { month: number; year: number; currency: string }
  next: string
}

export function MembershipActions({ mode, signedIn, isPremium, autoRenew, cancelAtPeriodEnd, prices, next }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month')
  const [method, setMethod] = useState<Method>('ecocash')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<{ reference: string; instructions: string | null } | null>(null)
  const [extend, setExtend] = useState(false)
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

  async function payWithPaynow() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interval, method, phone, next }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(t(data.error === 'INVALID_PHONE' ? 'pay.invalidPhone' : 'pay.failed'))
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl
      return
    }
    setWaiting({ reference: data.reference, instructions: data.instructions })
  }

  if (mode === 'app') {
    return <p className="text-center text-sm text-gray-600">{t(isPremium ? 'membership.appActive' : 'membership.appUnavailable')}</p>
  }

  if (!signedIn) {
    return <Button block size="lg" variant="premium" onClick={() => router.push(`/signup?next=${encodeURIComponent(`/membership?next=${next}`)}`)}>{t('premium.becomeMember')}</Button>
  }

  if (waiting) return <PaymentWaiter reference={waiting.reference} instructions={waiting.instructions} method={method} next={next} onCancel={() => setWaiting(null)} />

  if (isPremium && !extend) {
    if (autoRenew) {
      return cancelAtPeriodEnd ? (
        <Button block variant="secondary" disabled={busy} onClick={() => run(() => supabase.rpc('resume_membership'), t('membership.resumed'))}>{t('membership.resume')}</Button>
      ) : (
        <Button block variant="secondary" disabled={busy} onClick={() => {
          if (window.confirm(t('membership.cancelConfirm'))) void run(() => supabase.rpc('cancel_membership'), t('membership.canceled'))
        }}>{t('membership.cancel')}</Button>
      )
    }
    return <Button block variant="secondary" onClick={() => setExtend(true)}>{t('membership.extend')}</Button>
  }

  const price = interval === 'month' ? prices.month : prices.year
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

      {mode === 'none' && <Alert tone="info">{t('membership.comingSoon')}</Alert>}

      {mode === 'demo' && (
        <>
          <Button block size="lg" variant="premium" disabled={busy}
            onClick={() => run(() => supabase.rpc('billing_demo_checkout', { p_interval: interval }), t('membership.welcome'), next)}>
            {t('premium.becomeMember')}
          </Button>
          <p className="text-center text-xs text-gray-500">{t('membership.demoNote')}</p>
        </>
      )}

      {mode === 'paynow' && (
        <>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-gray-700">{t('pay.method')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {([['ecocash', 'EcoCash', Smartphone], ['onemoney', 'OneMoney', Smartphone], ['web', t('pay.card'), CreditCard]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                  className={clsx('flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-sm font-semibold ring-2', method === m ? 'bg-brand-50 text-brand-800 ring-brand-600' : 'bg-white text-gray-700 ring-gray-200')}>
                  <Icon className="size-5" />{label}
                </button>
              ))}
            </div>
          </fieldset>
          {method !== 'web' ? (
            <Field label={t('pay.phone', { method: method === 'ecocash' ? 'EcoCash' : 'OneMoney' })} hint={t('pay.phoneHint')}>
              <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          ) : (
            <p className="text-xs text-gray-500">{t('pay.cardHint')}</p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <Button block size="lg" variant="premium" disabled={busy || (method !== 'web' && phone.trim().length < 9)} onClick={payWithPaynow}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('pay.payNow', { amount: formatPrice(price, prices.currency, locale) })}
          </Button>
          <p className="text-center text-xs text-gray-500">{t('pay.prepaidNote')}</p>
        </>
      )}
    </div>
  )
}

/** Polls the payment until Paynow confirms it (mobile prompt approved, or card payment returned). */
export function PaymentWaiter({ reference, instructions, method, next, onCancel }: {
  reference: string; instructions: string | null; method: Method | 'return'; next: string; onCancel?: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [state, setState] = useState<'pending' | 'succeeded' | 'failed' | 'timeout'>('pending')

  useEffect(() => {
    let stop = false
    const started = Date.now()
    async function check() {
      if (stop) return
      const res = await fetch(`/api/billing/status?reference=${encodeURIComponent(reference)}`, { cache: 'no-store' }).catch(() => null)
      const data = res?.ok ? await res.json() : { status: 'pending' }
      if (stop) return
      if (data.status === 'succeeded') {
        setState('succeeded')
        toast({ text: t('membership.welcome'), tone: 'success' })
        router.push(next)
        router.refresh()
        return
      }
      if (data.status === 'failed') return setState('failed')
      if (Date.now() - started > 3 * 60_000) return setState('timeout')
      setTimeout(check, 3000)
    }
    void check()
    return () => {
      stop = true
    }
  }, [reference, next, router, t])

  if (state === 'failed' || state === 'timeout') {
    return (
      <div className="space-y-3">
        <Alert tone={state === 'failed' ? 'error' : 'warning'}>{t(state === 'failed' ? 'pay.declined' : 'pay.timeout')}</Alert>
        {onCancel && <Button block variant="secondary" onClick={onCancel}>{t('pay.tryAgain')}</Button>}
      </div>
    )
  }
  return (
    <div className="space-y-3 text-center" aria-live="polite">
      <Loader2 className="mx-auto size-8 animate-spin text-brand-600" />
      <p className="font-semibold text-gray-900">{t(method === 'ecocash' || method === 'onemoney' ? 'pay.approveOnPhone' : 'pay.confirming')}</p>
      {instructions && <p className="text-sm whitespace-pre-line text-gray-600">{instructions}</p>}
      <p className="text-xs text-gray-500">{t('pay.reference', { reference })}</p>
      {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>}
    </div>
  )
}
