import { BadgeCheck, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { FoundingBadge } from '@/components/FoundingBadge'
import { PropertyCard } from '@/components/PropertyCard'
import { Card, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import type { ProviderProfile, SearchResult } from '@/lib/types'

const load = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_provider_profile', { p_id: id })
  return (data as ProviderProfile | null) ?? null
})

export async function generateMetadata({ params }: PageProps<'/providers/[id]'>): Promise<Metadata> {
  const provider = await load((await params).id)
  return { title: provider?.name ?? 'Provider' }
}

export default async function ProviderPage({ params }: PageProps<'/providers/[id]'>) {
  const { id } = await params
  const provider = await load(id)
  if (!provider) notFound()
  const { t, locale } = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc('search_properties', { p_filters: { provider_id: id }, p_limit: 60 })
  const listings = (data as SearchResult | null)?.items ?? []

  return (
    <div className="space-y-6">
      <Card className="p-5 md:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-extrabold text-white">
            {provider.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{provider.name}</h1>
            {provider.verified && <p className="inline-flex items-center gap-1 font-semibold text-brand-700"><BadgeCheck className="size-5" />{t('provider.verified')}</p>}
            {provider.founding && <div className="my-1"><FoundingBadge size="md" /></div>}
            <p className="text-gray-600">{t(`providerType.${provider.type}`)}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-gray-500"><MapPin className="size-4" />{provider.city}, {provider.country}</p>
          </div>
        </div>
        {provider.about && (
          <div className="mt-5">
            <h2 className="mb-1 font-bold text-gray-900">{t('provider.about')}</h2>
            <p className="whitespace-pre-line text-gray-700">{provider.about}</p>
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 p-3"><dt className="text-gray-500">{t('provider.activeListings')}</dt><dd className="text-xl font-bold">{provider.active_count}</dd></div>
          <div className="rounded-xl bg-gray-50 p-3"><dt className="text-gray-500">{t('provider.memberSinceLabel')}</dt><dd className="text-xl font-bold">{formatDate(provider.member_since, locale)}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-gray-500">{t('provider.verifiedMeaning')}</p>
      </Card>

      <section>
        <h2 className="mb-3 text-xl font-bold text-gray-900">{t('provider.listings')}</h2>
        {listings.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{listings.map((p) => <PropertyCard key={p.id} property={p} />)}</div>
        ) : (
          <EmptyState title={t('provider.noListings')} />
        )}
      </section>
    </div>
  )
}
