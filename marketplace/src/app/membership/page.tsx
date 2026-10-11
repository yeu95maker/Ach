import { Check, Minus } from 'lucide-react'
import type { Metadata } from 'next'
import { MembershipActions } from '@/components/MembershipActions'
import { Alert, Card, PageHeader } from '@/components/ui'
import { getAccount } from '@/lib/account'
import { billingMode } from '@/lib/billing'
import { formatDate, formatPrice } from '@/lib/format'
import type { MessageKey } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { safeNext } from '@/lib/next'
import { createClient } from '@/lib/supabase/server'
import type { AppSettings } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('membership.title') }
}

type Cell = boolean | MessageKey
const ROWS: [MessageKey, Cell, Cell][] = [
  ['membership.row.search', true, true],
  ['membership.row.map', true, true],
  ['membership.row.basicFilters', true, true],
  ['membership.row.standard', true, true],
  ['membership.row.contact', true, true],
  ['membership.row.save', 'membership.limited', 'membership.unlimited'],
  ['membership.row.premiumListings', false, true],
  ['membership.row.earlyAccess', false, true],
  ['membership.row.advancedFilters', false, true],
  ['membership.row.savedSearches', false, true],
  ['membership.row.alerts', 'membership.limited', true],
]

export default async function MembershipPage({ searchParams }: PageProps<'/membership'>) {
  const { t, locale } = await getT()
  const next = safeNext((await searchParams).next, '/membership')
  const account = await getAccount()
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('currency, premium_price_month, premium_price_year, free_favorites_limit, early_access_hours').single()
  const s = (data as AppSettings | null) ?? { currency: 'USD', premium_price_month: 9, premium_price_year: 90, free_favorites_limit: 10, early_access_hours: 48, demo_billing: false }
  const m = account?.membership
  const cell = (c: Cell) =>
    c === true ? <Check className="mx-auto size-5 text-brand-600" aria-label="✓" /> : c === false ? <Minus className="mx-auto size-5 text-gray-300" aria-label="—" /> : <span className="text-sm font-medium">{t(c, { n: s.free_favorites_limit })}</span>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('membership.title')} subtitle={t('membership.subtitle')} />

      {account?.is_premium && m && (
        <Alert tone="success">
          {t('membership.current', { plan: t('premium.name') })}{' '}
          {t(m.cancel_at_period_end ? 'membership.endsOn' : 'membership.renewsOn', { date: formatDate(m.current_period_end, locale) })}
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-bold tracking-wide text-gray-500 uppercase">{t('membership.free')}</p>
          <p className="mt-1 text-3xl font-extrabold">{formatPrice(0, s.currency, locale)}</p>
          <p className="mt-2 text-sm text-gray-600">{t('membership.freeText', { n: s.free_favorites_limit })}</p>
        </Card>
        <Card className="bg-gray-900 p-5 text-white ring-0">
          <p className="text-sm font-bold tracking-wide text-gold-100 uppercase">{t('premium.name')}</p>
          <p className="mt-1 text-3xl font-extrabold">{formatPrice(s.premium_price_month, s.currency, locale)} <span className="text-base font-medium text-gray-400">/ {t('membership.month')}</span></p>
          <p className="mt-2 mb-4 text-sm text-gray-300">{t('membership.premiumText', { n: s.early_access_hours })}</p>
          <div className="rounded-2xl bg-white p-3 text-gray-900">
            <MembershipActions mode={billingMode()} signedIn={!!account} isPremium={!!account?.is_premium} cancelAtPeriodEnd={!!m?.cancel_at_period_end}
              prices={{ month: s.premium_price_month, year: s.premium_price_year, currency: s.currency }} next={next} />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-sm">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-600">{t('membership.feature')}</th>
              <th className="w-24 px-2 py-3 text-center font-semibold text-gray-600">{t('membership.free')}</th>
              <th className="w-24 px-2 py-3 text-center font-semibold text-gold-700">{t('premium.name')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[15px]">
            {ROWS.map(([label, free, premium]) => (
              <tr key={label}>
                <td className="px-4 py-3 text-gray-800">{t(label)}</td>
                <td className="px-2 py-3 text-center">{cell(free)}</td>
                <td className="px-2 py-3 text-center">{cell(premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-center text-sm text-gray-500">{t('membership.browseFree')}</p>
    </div>
  )
}
