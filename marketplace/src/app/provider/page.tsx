import { Eye, FileSpreadsheet, Heart, MessageCircle, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DashboardActions } from '@/components/DashboardActions'
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { daysAgo, formatPrice } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { imageUrl } from '@/lib/images'
import { createClient } from '@/lib/supabase/server'
import type { DashboardProperty, PropertyStatus } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('dashboard.title') }
}

const STATUS_TONE: Record<PropertyStatus, 'green' | 'gold' | 'gray' | 'red' | 'blue' | 'dark'> = {
  active: 'green', pending: 'gold', draft: 'gray', rejected: 'red', removed: 'red', sold: 'blue',
}
const STALE_DAYS = 30

export default async function DashboardPage() {
  const account = await requireAccount('/provider')
  if (!account.provider) redirect('/provider/onboarding')
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc('provider_dashboard')
  const items = (data as DashboardProperty[] | null) ?? []
  const verified = account.provider.status === 'verified'
  const totals = items.reduce((s, p) => ({ views: s.views + p.views, inquiries: s.inquiries + p.inquiries, favorites: s.favorites + p.favorites }), { views: 0, inquiries: 0, favorites: 0 })

  return (
    <div className="space-y-5">
      <PageHeader title={t('dashboard.title')} subtitle={account.provider.display_name}
        action={account.provider.status !== 'suspended' ? (
          <div className="flex flex-wrap justify-end gap-2">
            <LinkButton href="/provider/import" variant="secondary"><FileSpreadsheet className="size-4" />{t('import.cta')}</LinkButton>
            {verified && <LinkButton href="/provider/properties/new"><Plus className="size-4" />{t('nav.addProperty')}</LinkButton>}
          </div>
        ) : undefined} />

      {!verified && (
        <Alert tone={account.provider.status === 'suspended' || account.provider.status === 'rejected' ? 'error' : 'warning'}>
          {t(`dashboard.status.${account.provider.status}`)}{' '}
          {account.provider.status !== 'suspended' && <Link href="/provider/onboarding" className="font-semibold underline">{t('dashboard.toVerification')}</Link>}
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Eye, label: t('dashboard.views'), value: totals.views },
          { icon: MessageCircle, label: t('dashboard.inquiries'), value: totals.inquiries },
          { icon: Heart, label: t('dashboard.saves'), value: totals.favorites },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-3.5">
            <Icon className="size-5 text-brand-600" />
            <p className="mt-1 text-2xl font-extrabold">{value.toLocaleString(locale)}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </Card>
        ))}
      </div>

      <h2 className="pt-2 text-lg font-bold text-gray-900">{t('dashboard.myProperties')}</h2>
      {items.length === 0 ? (
        <EmptyState title={t('dashboard.emptyTitle')} text={t('dashboard.emptyText')}
          action={<LinkButton href="/provider/properties/new"><Plus className="size-4" />{t('nav.addProperty')}</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const cover = imageUrl(p.cover_image)
            const stale = !!p.last_confirmed_at && daysAgo(p.last_confirmed_at) >= STALE_DAYS
            return (
              <li key={p.id}>
                <Card className="p-3.5">
                  <div className="flex gap-3">
                    <Link href={`/properties/${p.id}`} className="size-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/properties/${p.id}`} className="truncate font-bold text-gray-900 hover:underline">{p.title}</Link>
                        <Badge tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
                      </div>
                      <p className="text-lg font-extrabold">{formatPrice(p.price, p.currency, locale)}</p>
                      <p className="text-sm text-gray-600">
                        {t('dashboard.viewsN', { n: p.views.toLocaleString(locale) })} · {t('dashboard.inquiriesN', { n: p.inquiries })} · {t('dashboard.savesN', { n: p.favorites })}
                      </p>
                      {p.is_premium && <Badge tone="dark" className="mt-1">🔒 {t('premium.membersOnly')}</Badge>}
                    </div>
                  </div>
                  {p.status === 'draft' && <Alert tone="info" className="mt-3">{t('dashboard.draftHint')}</Alert>}
                  {p.status === 'rejected' && p.moderation_note && <Alert tone="error" className="mt-3">{t('dashboard.rejectedReason')} {p.moderation_note}</Alert>}
                  {p.status === 'active' && stale && <Alert tone="warning" className="mt-3">{t('dashboard.stalePrompt', { n: daysAgo(p.last_confirmed_at!) })}</Alert>}
                  <div className="mt-3"><DashboardActions p={p} stale={stale} /></div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
