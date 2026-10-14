import { BadgeCheck, Bath, BedDouble, Car, Check, Clock, Lock, MapPin, Ruler, X } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { FoundingBadge } from '@/components/FoundingBadge'
import { Gallery } from '@/components/Gallery'
import { LocationMap } from '@/components/map/LocationMap'
import { MessageProviderButton, ReportButton, ViewTracker } from '@/components/PropertyActions'
import { SaveButton } from '@/components/SaveButton'
import { Alert, Badge, Card, LinkButton } from '@/components/ui'
import { featuresFor, hasRooms } from '@/lib/filters'
import { daysAgo, formatArea, formatDate, formatDistance, formatPrice, hoursUntil } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { imageUrl } from '@/lib/images'
import { createClient } from '@/lib/supabase/server'
import type { PropertyDetail } from '@/lib/types'

const UUID = /^[0-9a-f-]{36}$/i

const load = cache(async (id: string): Promise<PropertyDetail | null> => {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_property', { p_id: id })
  return (data as PropertyDetail | null) ?? null
})

export async function generateMetadata({ params }: PageProps<'/properties/[id]'>): Promise<Metadata> {
  const p = await load((await params).id)
  const { t } = await getT()
  if (!p) return { title: t('error.notFound') }
  const title = p.locked ? `${t('locked.title')} – ${p.area}` : `${p.title} – ${p.area}`
  const cover = imageUrl(p.cover_image)
  return {
    title,
    description: p.locked ? t('locked.text') : p.description?.slice(0, 160),
    openGraph: { title, images: cover && !cover.startsWith('/') ? [cover] : undefined },
  }
}

export default async function PropertyPage({ params }: PageProps<'/properties/[id]'>) {
  const { id } = await params
  const p = await load(id)
  if (!p) notFound()
  const { t, locale } = await getT()

  const listedDays = p.published_at ? daysAgo(p.published_at) : null
  const confirmedDays = p.last_confirmed_at ? daysAgo(p.last_confirmed_at) : null
  const earlyHours = p.early_access_until ? hoursUntil(p.early_access_until) : 0
  const title = p.locked ? t('locked.title') : p.title
  const relevantFeatures = featuresFor(p.category)
  const details: [string, React.ReactNode][] = [
    [t('detail.type'), t(`category.${p.category}`)],
    [t('detail.price'), p.price !== null ? formatPrice(p.price, p.currency, locale) : <span className="inline-flex items-center gap-1 text-gray-400"><Lock className="size-4" />{t('locked.price')}</span>],
    ...(p.land_size_m2 ? [[t('detail.landSize'), formatArea(p.land_size_m2, locale)] as [string, string]] : []),
    ...(p.living_area_m2 ? [[t('detail.livingArea'), formatArea(p.living_area_m2, locale)] as [string, string]] : []),
    ...(hasRooms(p.category) && p.bedrooms !== null ? [[t('detail.bedrooms'), p.bedrooms] as [string, number]] : []),
    ...(hasRooms(p.category) && p.bathrooms !== null ? [[t('detail.bathrooms'), p.bathrooms] as [string, number]] : []),
    ...(p.parking_spaces !== null ? [[t('detail.parking'), p.parking_spaces] as [string, number]] : []),
  ]

  return (
    <div className="mx-auto max-w-4xl">
      {p.status === 'active' && <ViewTracker propertyId={p.id} />}
      {p.status !== 'active' && (
        <Alert tone="warning" className="mb-4">{t('detail.previewNotice', { status: t(`status.${p.status}`) })}</Alert>
      )}

      <Gallery images={p.images} total={p.image_count} locked={p.locked} />

      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <header>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {p.is_premium && <Badge tone="dark">🔒 {t('premium.membersOnly')}</Badge>}
              {earlyHours > 0 && <Badge tone="gold"><Clock className="size-3" />{t('premium.earlyAccessHours', { n: earlyHours })}</Badge>}
              {p.provider?.verified && <Badge tone="green"><BadgeCheck className="size-3.5" />{t('provider.verified')}</Badge>}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">{title}</h1>
            <p className="mt-1 inline-flex items-center gap-1 text-gray-600"><MapPin className="size-4" />{p.area}, {p.city}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
              {p.price !== null ? formatPrice(p.price, p.currency, locale) : <span className="inline-flex items-center gap-2 text-gray-400"><Lock className="size-6" />{t('locked.price')}</span>}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[15px] text-gray-700">
              {p.bedrooms !== null && <li className="inline-flex items-center gap-1.5"><BedDouble className="size-5" />{t('card.bedrooms', { n: p.bedrooms })}</li>}
              {p.bathrooms !== null && <li className="inline-flex items-center gap-1.5"><Bath className="size-5" />{t('card.bathrooms', { n: p.bathrooms })}</li>}
              {(p.land_size_m2 ?? p.living_area_m2) && <li className="inline-flex items-center gap-1.5"><Ruler className="size-5" />{formatArea((p.land_size_m2 ?? p.living_area_m2)!, locale)}</li>}
              {p.features.includes('garage') && <li className="inline-flex items-center gap-1.5"><Car className="size-5" />{t('feature.garage')}</li>}
            </ul>
            <p className="mt-3 text-sm text-gray-500">
              {listedDays !== null && (listedDays === 0 ? t('detail.listedToday') : t('detail.listedAgo', { n: listedDays }))}
              {confirmedDays !== null && ` · ${confirmedDays === 0 ? t('detail.confirmedToday') : t('detail.confirmedAgo', { n: confirmedDays })}`}
            </p>
          </header>

          {p.locked && (
            <Card className="bg-gray-900 p-5 text-white ring-0">
              <p className="text-sm font-bold tracking-wide text-gold-100 uppercase">{t(p.lock_reason === 'early_access' ? 'premium.earlyAccess' : 'premium.listing')}</p>
              <p className="mt-1 text-lg font-bold">{t(p.lock_reason === 'early_access' ? 'locked.earlyText' : 'locked.text', { n: earlyHours })}</p>
              <ul className="mt-3 space-y-1 text-sm text-gray-300">
                <li>🔒 {t('locked.itemPrice')}</li>
                <li>🔒 {t('locked.itemGallery')}</li>
                <li>🔒 {t('locked.itemContact')}</li>
              </ul>
              <LinkButton href={`/membership?next=/properties/${p.id}`} variant="secondary" className="mt-4">{t('premium.unlockCta')}</LinkButton>
            </Card>
          )}

          <section>
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('detail.main')}</h2>
            <dl className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200/70">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-3 text-[15px]">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-right font-semibold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('detail.features')}</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {relevantFeatures.map((f) => {
                const has = p.features.includes(f)
                return (
                  <li key={f} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${has ? 'bg-brand-50 font-semibold text-brand-800 ring-brand-200' : 'bg-white text-gray-400 ring-gray-200'}`}>
                    {has ? <Check className="size-4" /> : <X className="size-4" />}{t(`feature.${f}`)}
                  </li>
                )
              })}
            </ul>
          </section>

          {p.description && (
            <section>
              <h2 className="mb-2 text-lg font-bold text-gray-900">{t('detail.description')}</h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-700">{p.description}</p>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-lg font-bold text-gray-900">{t('detail.area')}</h2>
            <LocationMap property={p} exact={p.show_exact_location} />
            {!p.show_exact_location && <p className="mt-2 text-xs text-gray-500">{t('detail.approxLocation')}</p>}
            {p.nearby.length > 0 && (
              <ul className="mt-3 divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200/70">
                {p.nearby.map((n, i) => (
                  <li key={i} className="flex justify-between gap-4 px-4 py-2.5 text-[15px]">
                    <span className="text-gray-700"><span className="font-semibold">{t(`nearby.${n.kind}`)}</span> · {n.name}</span>
                    <span className="shrink-0 font-semibold text-gray-900">{formatDistance(n.distance_m, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 md:sticky md:top-20 md:self-start">
          {p.provider ? (
            <Card className="p-4">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{t('provider.offeredBy')}</p>
              <Link href={`/providers/${p.provider.id}`} className="mt-1 block text-lg font-bold text-gray-900 hover:underline">{p.provider.name}</Link>
              {p.provider.verified && <p className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><BadgeCheck className="size-4" />{t('provider.verified')}</p>}
              {p.provider.founding && <div className="mt-1"><FoundingBadge /></div>}
              <p className="mt-1 text-sm text-gray-600">{t(`providerType.${p.provider.type}`)}</p>
              <p className="text-sm text-gray-600">{t('provider.memberSince', { date: formatDate(p.provider.member_since, locale) })} · {t('provider.activeCount', { n: p.provider.active_count })}</p>
              <div className="mt-4 space-y-2">
                {!p.is_owner && <MessageProviderButton propertyId={p.id} conversationId={p.conversation_id} block />}
                <LinkButton href={`/providers/${p.provider.id}`} variant="secondary" block>{t('provider.view')}</LinkButton>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">{t('provider.verifiedMeaning')}</p>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="inline-flex items-center gap-2 font-semibold text-gray-700"><Lock className="size-4" />{t('locked.itemContact')}</p>
              <LinkButton href={`/membership?next=/properties/${p.id}`} variant="premium" block className="mt-3">{t('premium.unlockCta')}</LinkButton>
            </Card>
          )}
          <div className="flex items-center justify-between">
            <SaveButton propertyId={p.id} initial={p.is_favorite} variant="button" />
            {!p.is_owner && <ReportButton propertyId={p.id} />}
          </div>
          {p.is_owner && <LinkButton href={`/provider/properties/${p.id}/edit`} variant="secondary" block>{t('dashboard.edit')}</LinkButton>}
        </aside>
      </div>
    </div>
  )
}
