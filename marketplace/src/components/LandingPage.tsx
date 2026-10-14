import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PropertyCard } from '@/components/PropertyCard'
import { EmptyState, LinkButton } from '@/components/ui'
import { filtersToQuery } from '@/lib/filters'
import { getT } from '@/lib/i18n/server'
import { AREAS } from '@/lib/locations'
import { landingFilters, landingPath, parseLanding, SITE_URL, type Landing } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import type { SearchResult } from '@/lib/types'

/**
 * Indexable, server-rendered location pages such as /rent/apartments/harare or
 * /buy/land/borrowdale – the entry points search engines send people to.
 */
async function heading(l: Landing) {
  const { t } = await getT()
  const type = l.category ? t(`categoryPlural.${l.category}`) : t('seo.properties')
  return t(l.tx === 'rent' ? 'seo.h1Rent' : 'seo.h1Buy', { type, place: l.place.name })
}

async function load(l: Landing) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('search_properties', { p_filters: landingFilters(l), p_limit: 24 })
  return (data as SearchResult | null) ?? { total: 0, items: [] }
}

export async function landingMetadata(tx: string, category: string, place: string): Promise<Metadata> {
  const l = parseLanding(tx, category, place)
  if (!l) return {}
  const { t } = await getT()
  const title = await heading(l)
  const { total } = await load(l)
  const path = landingPath(l.tx, l.category, l.place.name)
  return {
    title,
    description: t('seo.description', { title, n: total }),
    alternates: { canonical: path },
    openGraph: { title, url: `${SITE_URL}${path}`, type: 'website' },
    // Empty pages are thin content: keep them out of the index until listings exist.
    robots: total === 0 ? { index: false, follow: true } : undefined,
  }
}

export async function LandingPage({ tx, category, place }: { tx: string; category: string; place: string }) {
  const l = parseLanding(tx, category, place)
  if (!l) notFound()
  const { t } = await getT()
  const title = await heading(l)
  const result = await load(l)
  const searchUrl = `/search?${filtersToQuery(landingFilters(l))}`
  const nearby = AREAS.filter((a) => a.city === l.place.city && a.area !== l.place.area).slice(0, 12)
  const otherTx = l.category === 'room' ? null : landingPath(l.tx === 'rent' ? 'sale' : 'rent', l.category, l.place.name)

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
        <Link href="/" className="hover:underline">{t('nav.home')}</Link> ›{' '}
        <Link href={landingPath(l.tx, null, l.place.city)} className="hover:underline">{t(l.tx === 'rent' ? 'transaction.rent' : 'transaction.sale')} · {l.place.city}</Link>
        {l.place.area && <> › {l.place.area}</>}
      </nav>
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">{title}</h1>
        <p className="mt-1 text-gray-600">{t('seo.intro', { n: result.total, place: l.place.name })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton href={searchUrl} size="sm">{t('seo.refine')}</LinkButton>
          <LinkButton href={`${searchUrl}&view=map`} size="sm" variant="secondary">{t('search.map')}</LinkButton>
          {otherTx && <LinkButton href={otherTx} size="sm" variant="ghost">{t(l.tx === 'rent' ? 'seo.switchBuy' : 'seo.switchRent')}</LinkButton>}
        </div>
      </header>

      {result.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.items.map((p) => <PropertyCard key={p.id} property={p} />)}</div>
      ) : (
        <EmptyState title={t('search.emptyTitle')} text={t('seo.emptyText')} action={<LinkButton href={`/search?${filtersToQuery({ transaction: l.tx, city: l.place.city })}`}>{t('seo.searchCity', { city: l.place.city })}</LinkButton>} />
      )}
      {result.total > result.items.length && (
        <div className="flex justify-center"><LinkButton href={searchUrl} variant="secondary">{t('seo.seeAll', { n: result.total })}</LinkButton></div>
      )}

      {nearby.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-gray-900">{t('seo.nearby')}</h2>
          <ul className="flex flex-wrap gap-2">
            {nearby.map((a) => (
              <li key={a.area}>
                <Link href={landingPath(l.tx, l.category, a.area!)} className="inline-block rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-brand-50">
                  {a.area}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
