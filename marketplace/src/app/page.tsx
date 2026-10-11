import { BadgeCheck, MessageCircle, Search } from 'lucide-react'
import Link from 'next/link'
import { HomeSearch } from '@/components/HomeSearch'
import { PropertyCard } from '@/components/PropertyCard'
import { Card, LinkButton } from '@/components/ui'
import { getAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { AREAS } from '@/lib/locations'
import { createClient } from '@/lib/supabase/server'
import type { SearchResult } from '@/lib/types'

export default async function HomePage() {
  const { t } = await getT()
  const supabase = await createClient()
  const [account, latest, locations] = await Promise.all([
    getAccount(),
    supabase.rpc('search_properties', { p_filters: { sort: 'newest' }, p_limit: 6 }),
    supabase.rpc('list_locations'),
  ])
  const items = (latest.data as SearchResult | null)?.items ?? []
  const suggestions = [
    ...new Set([
      'Harare',
      ...((locations.data as { area: string; city: string }[] | null) ?? []).map((l) => `${l.area}, ${l.city}`),
      ...AREAS.map((a) => `${a.area}, ${a.city}`),
    ]),
  ]

  return (
    <div className="space-y-10">
      <section className="-mx-4 -mt-4 bg-gradient-to-b from-brand-50 to-transparent px-4 pt-6 pb-2 md:rounded-b-3xl">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">{t('home.title')}</h1>
          <p className="mt-1.5 mb-6 text-gray-600">{t('home.subtitle')}</p>
          <Card className="p-4 md:p-6">
            <HomeSearch suggestions={suggestions} />
          </Card>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Search, title: t('principle.discover'), text: t('principle.discoverText') },
          { icon: BadgeCheck, title: t('principle.trust'), text: t('principle.trustText') },
          { icon: MessageCircle, title: t('principle.connect'), text: t('principle.connectText') },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200/70">
            <Icon className="mt-0.5 size-6 shrink-0 text-brand-600" />
            <div>
              <p className="font-bold text-gray-900">{title}</p>
              <p className="text-sm text-gray-600">{text}</p>
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl font-bold text-gray-900">{t('home.latest')}</h2>
          <Link href="/search" className="text-sm font-semibold text-brand-700">{t('home.seeAll')} →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => <PropertyCard key={p.id} property={p} />)}
        </div>
      </section>

      {!account?.is_premium && (
        <section className="rounded-3xl bg-gray-900 p-6 text-white md:p-8">
          <p className="text-sm font-bold tracking-wide text-gold-100 uppercase">{t('premium.name')}</p>
          <h2 className="mt-1 text-2xl font-extrabold">{t('home.premiumTitle')}</h2>
          <p className="mt-2 max-w-xl text-gray-300">{t('home.premiumText')}</p>
          <LinkButton href="/membership" variant="secondary" className="mt-5">{t('premium.compare')}</LinkButton>
        </section>
      )}

      {!account?.provider && (
        <section className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-white p-6 ring-1 ring-gray-200 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('home.sellTitle')}</h2>
            <p className="mt-1 text-gray-600">{t('home.sellText')}</p>
          </div>
          <LinkButton href={account ? '/provider/onboarding' : '/signup?intent=provider'}>{t('home.sellCta')}</LinkButton>
        </section>
      )}
    </div>
  )
}
