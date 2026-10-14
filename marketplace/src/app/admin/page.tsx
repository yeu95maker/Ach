import clsx from 'clsx'
import { PriceText } from '@/components/PriceText'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FoundingToggle, PartnerForm, PropertyModeration, ProviderReview, ReportResolution, UserActions } from '@/components/AdminActions'
import { CopyLink } from '@/components/CopyLink'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { formatDate, formatPrice } from '@/lib/format'
import type { Locale, MessageKey, TFunction } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { imageUrl } from '@/lib/images'
import { createClient } from '@/lib/supabase/server'
import type { PropertyCard, PropertyStatus, ProviderStatus, ProviderType } from '@/lib/types'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

const TABS = ['overview', 'providers', 'properties', 'reports', 'partners', 'users'] as const
type Tab = (typeof TABS)[number]

interface AdminProvider {
  id: string; display_name: string; provider_type: ProviderType; status: ProviderStatus; status_note: string | null
  city: string; country: string; created_at: string; owner_email: string; active_count: number
  is_founding: boolean; referral_code: string | null
  verification: null | {
    legal_name: string; contact_phone: string; contact_email: string; id_document_type: string; id_document_number: string
    business_name: string | null; business_registration_number: string | null; agent_license_number: string | null
    document_paths: string[]; status: string; created_at: string
  }
}
type AdminProperty = PropertyCard & { status: PropertyStatus; submitted_at: string | null; moderation_note: string | null; description: string; views: number; provider_status: ProviderStatus; open_reports: number }
interface AdminReport { id: string; reason: string; details: string; status: string; created_at: string; reporter_email: string; property: { id: string; title: string; status: PropertyStatus; area: string; city: string; provider_id: string; provider_name: string } }
interface AdminUser { id: string; email: string; full_name: string; is_admin: boolean; is_suspended: boolean; created_at: string; is_premium: boolean; provider: { display_name: string; status: ProviderStatus } | null }

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const account = await requireAccount('/admin')
  if (!account.is_admin) notFound()
  const params = await searchParams
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'overview'
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data: stats } = await supabase.rpc('admin_stats')
  const s = (stats ?? {}) as Record<string, number | string | null>

  const tabLabel: Record<Tab, string> = {
    overview: t('admin.tab.overview'),
    providers: `${t('admin.tab.providers')}${Number(s.providers_pending) ? ` (${s.providers_pending})` : ''}`,
    properties: `${t('admin.tab.properties')}${Number(s.properties_pending) ? ` (${s.properties_pending})` : ''}`,
    reports: `${t('admin.tab.reports')}${Number(s.reports_open) ? ` (${s.reports_open})` : ''}`,
    partners: t('admin.tab.partners'),
    users: t('admin.tab.users'),
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.title')} />
      <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((x) => (
          <Link key={x} href={`/admin?tab=${x}`} aria-current={tab === x ? 'page' : undefined}
            className={clsx('h-9 shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1', tab === x ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300')}>
            {tabLabel[x]}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && <Overview s={s} t={t} locale={locale} />}
      {tab === 'providers' && <Providers status={params.status as ProviderStatus | undefined} t={t} locale={locale} />}
      {tab === 'properties' && <Properties status={(params.status as PropertyStatus | undefined) ?? 'pending'} t={t} locale={locale} />}
      {tab === 'reports' && <Reports t={t} locale={locale} />}
      {tab === 'partners' && <Partners t={t} locale={locale} />}
      {tab === 'users' && <Users q={typeof params.q === 'string' ? params.q : ''} t={t} locale={locale} />}
    </div>
  )
}

interface Ctx {
  t: TFunction
  locale: Locale
}
async function Providers({ status, t, locale }: { status?: ProviderStatus } & Ctx) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_providers', { p_status: status ?? null })
  const items = (data as AdminProvider[] | null) ?? []
  const paths = items.flatMap((p) => p.verification?.document_paths ?? [])
  const signed = paths.length ? (await supabase.storage.from('verification-docs').createSignedUrls(paths, 600)).data ?? [] : []
  const urlFor = (path: string) => signed.find((x) => x.path === path)?.signedUrl
  return (
    <div className="space-y-3">
      <Filters base="/admin?tab=providers" current={status} options={['pending', 'verified', 'rejected', 'suspended', 'unverified']} label={(v) => t(`providerStatus.${v}` as MessageKey)} />
      {items.length === 0 && <EmptyState title={t('admin.nothing')} />}
      {items.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={`/providers/${p.id}`} className="text-lg font-bold hover:underline">{p.display_name}</Link>
              <p className="text-sm text-gray-600">{t(`providerType.${p.provider_type}`)} · {p.city}, {p.country} · {p.owner_email}</p>
              {p.referral_code && <p className="text-xs text-gray-500">{t('referral.via', { code: p.referral_code })}</p>}
              <p className="text-xs text-gray-500">{formatDate(p.created_at, locale)} · {t('provider.activeCount', { n: p.active_count })}</p>
            </div>
            <Badge tone={p.status === 'verified' ? 'green' : p.status === 'pending' ? 'gold' : p.status === 'suspended' || p.status === 'rejected' ? 'red' : 'gray'}>{t(`providerStatus.${p.status}`)}</Badge>
          </div>
          {p.status_note && <p className="mt-2 text-sm text-gray-600">{t('admin.note')}: {p.status_note}</p>}
          {p.verification && (
            <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-sm sm:grid-cols-2">
              <div><dt className="inline text-gray-500">{t('onboarding.legalName')}: </dt><dd className="inline font-medium">{p.verification.legal_name}</dd></div>
              <div><dt className="inline text-gray-500">{t('onboarding.phone')}: </dt><dd className="inline font-medium">{p.verification.contact_phone}</dd></div>
              <div><dt className="inline text-gray-500">{t('auth.email')}: </dt><dd className="inline font-medium">{p.verification.contact_email}</dd></div>
              <div><dt className="inline text-gray-500">{t(`idType.${p.verification.id_document_type}` as MessageKey)}: </dt><dd className="inline font-medium">{p.verification.id_document_number}</dd></div>
              {p.verification.business_name && <div><dt className="inline text-gray-500">{t('onboarding.businessName')}: </dt><dd className="inline font-medium">{p.verification.business_name}</dd></div>}
              {p.verification.business_registration_number && <div><dt className="inline text-gray-500">{t('onboarding.registration')}: </dt><dd className="inline font-medium">{p.verification.business_registration_number}</dd></div>}
              {p.verification.agent_license_number && <div><dt className="inline text-gray-500">{t('onboarding.agentLicense')}: </dt><dd className="inline font-medium">{p.verification.agent_license_number}</dd></div>}
              <div className="sm:col-span-2">
                <dt className="inline text-gray-500">{t('onboarding.documents')}: </dt>
                <dd className="inline">
                  {p.verification.document_paths.length === 0 ? '—' : p.verification.document_paths.map((d, i) => {
                    const url = urlFor(d)
                    return url ? <a key={d} href={url} target="_blank" rel="noreferrer" className="mr-2 font-semibold text-brand-700 underline">#{i + 1}</a> : <span key={d} className="mr-2">#{i + 1}</span>
                  })}
                </dd>
              </div>
            </dl>
          )}
          <div className="mt-3 space-y-2"><ProviderReview id={p.id} status={p.status} /><FoundingToggle id={p.id} founding={p.is_founding} /></div>
        </Card>
      ))}
    </div>
  )
}

async function Properties({ status, t, locale }: { status: PropertyStatus } & Ctx) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_properties', { p_status: status })
  const items = (data as AdminProperty[] | null) ?? []
  return (
    <div className="space-y-3">
      <Filters base="/admin?tab=properties" current={status} options={['pending', 'active', 'rejected', 'removed', 'sold']} label={(v) => t(`status.${v}` as MessageKey)} />
      {items.length === 0 && <EmptyState title={t('admin.nothing')} />}
      {items.map((p) => {
        const cover = imageUrl(p.cover_image)
        return (
          <Card key={p.id} className="p-4">
            <div className="flex gap-3">
              <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">{cover && <img src={cover} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/properties/${p.id}`} className="font-bold hover:underline">{p.title}</Link>
                  <div className="flex gap-1">
                    {p.is_premium && <Badge tone="dark">🔒 {t('premium.membersOnly')}</Badge>}
                    {p.open_reports > 0 && <Badge tone="red">{t('admin.reportsN', { n: p.open_reports })}</Badge>}
                  </div>
                </div>
                <p className="text-sm text-gray-600">{t(`category.${p.category}`)} · {p.area}, {p.city} · {p.price !== null ? <PriceText amount={p.price} currency={p.currency} transaction={p.transaction} /> : ''}</p>
                <p className="text-sm text-gray-600">{p.provider?.name} {p.provider_status !== 'verified' && <Badge tone="red">{t(`providerStatus.${p.provider_status}`)}</Badge>}</p>
                <p className="text-xs text-gray-500">{p.submitted_at && t('admin.submitted', { date: formatDate(p.submitted_at, locale) })} · {p.image_count} 📷 · {t('dashboard.viewsN', { n: p.views })}</p>
              </div>
            </div>
            {p.description && <p className="mt-2 line-clamp-3 text-sm text-gray-700">{p.description}</p>}
            {p.moderation_note && <p className="mt-2 text-sm text-red-700">{t('admin.note')}: {p.moderation_note}</p>}
            <div className="mt-3"><PropertyModeration id={p.id} status={p.status} isPremium={p.is_premium} /></div>
          </Card>
        )
      })}
    </div>
  )
}

async function Reports({ t, locale }: Ctx) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_reports', { p_status: 'open' })
  const items = (data as AdminReport[] | null) ?? []
  if (!items.length) return <EmptyState title={t('admin.noReports')} />
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Badge tone="red">{t(`report.reason.${r.reason}` as MessageKey)}</Badge>
              <Link href={`/properties/${r.property.id}`} className="mt-1 block font-bold hover:underline">{r.property.title}</Link>
              <p className="text-sm text-gray-600">{r.property.area}, {r.property.city} · {r.property.provider_name} · {t(`status.${r.property.status}`)}</p>
            </div>
            <p className="text-xs text-gray-500">{formatDate(r.created_at, locale)} · {r.reporter_email}</p>
          </div>
          {r.details && <p className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{r.details}</p>}
          <div className="mt-3"><ReportResolution id={r.id} /></div>
        </Card>
      ))}
    </div>
  )
}

async function Users({ q, t }: { q: string } & Ctx) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_users', { p_query: q || null, p_limit: 100 })
  const items = (data as AdminUser[] | null) ?? []
  return (
    <div className="space-y-3">
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="users" />
        <input name="q" defaultValue={q} placeholder={t('admin.searchUsers')} aria-label={t('admin.searchUsers')} className="h-10 flex-1 rounded-xl bg-white px-3 ring-1 ring-gray-300" />
        <button className="h-10 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white">{t('home.search')}</button>
      </form>
      <ul className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200/70">
        {items.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{u.full_name || '—'} <span className="font-normal text-gray-500">{u.email}</span></p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {u.is_admin && <Badge tone="blue">Admin</Badge>}
                {u.is_premium && <Badge tone="gold">{t('premium.name')}</Badge>}
                {u.provider && <Badge tone="green">{u.provider.display_name} · {t(`providerStatus.${u.provider.status}`)}</Badge>}
                {u.is_suspended && <Badge tone="red">{t('admin.suspended')}</Badge>}
              </div>
            </div>
            {!u.is_admin && <UserActions id={u.id} suspended={u.is_suspended} isPremium={u.is_premium} />}
          </li>
        ))}
      </ul>
    </div>
  )
}


interface AdminPartner {
  id: string; code: string; name: string; contact: string | null; active: boolean; created_at: string
  providers: number; verified: number; qualified: number; active_listings: number
  provider_list: { id: string; name: string; status: ProviderStatus; active_listings: number; created_at: string }[]
}

const QUALIFY_LISTINGS = 5

async function Partners({ t }: Ctx) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_partners', { p_min_listings: QUALIFY_LISTINGS })
  const items = (data as AdminPartner[] | null) ?? []
  const base = process.env.APP_URL ?? ''
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 font-bold">{t('partners.add')}</h2>
        <p className="mb-3 text-sm text-gray-600">{t('partners.explain', { n: QUALIFY_LISTINGS })}</p>
        <PartnerForm />
      </Card>
      {items.length === 0 && <EmptyState title={t('admin.nothing')} />}
      {items.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{p.name} <span className="font-mono text-sm text-gray-500">{p.code}</span></p>
              {p.contact && <p className="text-sm text-gray-600">{p.contact}</p>}
            </div>
            {!p.active && <Badge tone="gray">{t('partners.inactive')}</Badge>}
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {([['partners.signedUp', p.providers], ['partners.verified', p.verified], ['partners.qualified', p.qualified], ['partners.listings', p.active_listings]] as [MessageKey, number][]).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gray-50 p-2"><dd className="text-xl font-extrabold">{v}</dd><dt className="text-xs text-gray-500">{t(k)}</dt></div>
            ))}
          </dl>
          <div className="mt-3"><CopyLink url={`${base}/for-providers?ref=${p.code}`} /></div>
          {p.provider_list.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {p.provider_list.map((pr) => (
                <li key={pr.id} className="flex justify-between gap-2 py-1.5">
                  <Link href={`/providers/${pr.id}`} className="font-medium hover:underline">{pr.name}</Link>
                  <span className="text-gray-500">{t(`providerStatus.${pr.status}`)} · {t('partners.listingsN', { n: pr.active_listings })}{pr.status === 'verified' && pr.active_listings >= QUALIFY_LISTINGS ? ' ✓' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}

function Filters<T extends string>({ base, current, options, label }: { base: string; current?: T; options: T[]; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Link key={o} href={`${base}&status=${o}`} className={clsx('rounded-full px-3 py-1 text-sm font-medium ring-1', current === o ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-700 ring-gray-300')}>
          {label(o)}
        </Link>
      ))}
    </div>
  )
}

function Overview({ s, t, locale }: { s: Record<string, number | string | null> } & Ctx) {
  const n = (k: string) => Number(s[k] ?? 0)
  const currency = String(s.currency ?? 'USD')
  const groups: [MessageKey, [MessageKey, string][]][] = [
    ['admin.group.supply', [['admin.stat.activeProperties', String(n('properties_active'))], ['admin.stat.newWeek', String(n('properties_new_7d'))], ['admin.stat.verifiedProviders', String(n('providers_verified'))], ['admin.stat.pendingProperties', String(n('properties_pending'))]]],
    ['admin.group.demand', [['admin.stat.views', n('views_total').toLocaleString(locale)], ['admin.stat.saves', String(n('favorites_total'))], ['admin.stat.contacts', String(n('conversations_total'))], ['admin.stat.users', String(n('users'))]]],
    ['admin.group.marketplace', [['admin.stat.withInquiry', `${n('share_with_inquiry')} %`], ['admin.stat.avgInquiries', String(n('avg_inquiries'))], ['admin.stat.firstInquiry', s.median_hours_to_first_inquiry === null ? '—' : `${n('median_hours_to_first_inquiry')} h`]]],
    ['admin.group.trust', [['admin.stat.openReports', String(n('reports_open'))], ['admin.stat.removed', String(n('properties_removed'))], ['admin.stat.pendingProviders', String(n('providers_pending'))]]],
    ['admin.group.revenue', [['admin.stat.premiumMembers', String(n('premium_members'))], ['admin.stat.revenue30', formatPrice(n('revenue_30d'), currency, locale)], ['admin.stat.revenueTotal', formatPrice(n('revenue_total'), currency, locale)]]],
  ]
  return (
    <div className="space-y-5">
      {groups.map(([title, stats]) => (
        <section key={title}>
          <h2 className="mb-2 text-sm font-bold tracking-wide text-gray-500 uppercase">{t(title)}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-2xl font-extrabold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500">{t(label)}</p>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
