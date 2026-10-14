import type { Filters } from './filters'
import { AREAS, CITIES } from './locations'
import type { Category, Transaction } from './types'

/** Public site URL for canonical links, sitemaps and share previews. */
export const SITE_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** URL segment ↔ category ("property" = all types). */
export const CATEGORY_SLUGS: Record<string, Category | null> = {
  property: null, apartments: 'apartment', houses: 'house', land: 'land', commercial: 'commercial', rooms: 'room',
}
export const TX_SLUGS: Record<string, Transaction> = { buy: 'sale', rent: 'rent' }

export const categorySlug = (c: Category | null | undefined) =>
  Object.entries(CATEGORY_SLUGS).find(([, v]) => v === (c ?? null))?.[0] ?? 'property'

/** Known city or suburb for a slug ("harare", "borrowdale", "mount-pleasant"). */
export function placeFromSlug(slug: string): { city: string; area?: string; name: string } | null {
  const area = AREAS.find((a) => slugify(a.area ?? '') === slug)
  if (area?.area) return { city: area.city, area: area.area, name: area.area }
  const city = CITIES.find((c) => slugify(c.city) === slug)
  return city ? { city: city.city, name: city.city } : null
}

export interface Landing {
  tx: Transaction
  category: Category | null
  place: { city: string; area?: string; name: string }
}

export function parseLanding(txSlug: string, catSlug: string, placeSlug: string): Landing | null {
  const tx = TX_SLUGS[txSlug]
  const category = catSlug in CATEGORY_SLUGS ? CATEGORY_SLUGS[catSlug] : undefined
  const place = placeFromSlug(placeSlug)
  if (!tx || category === undefined || !place || (category === 'room' && tx === 'sale')) return null
  return { tx, category, place }
}

export const landingPath = (tx: Transaction, category: Category | null, placeName: string) =>
  `/${tx === 'rent' ? 'rent' : 'buy'}/${categorySlug(category)}/${slugify(placeName)}`

export const landingFilters = (l: Landing): Filters => ({
  transaction: l.tx,
  ...(l.category ? { category: l.category } : {}),
  country: 'Zimbabwe',
  city: l.place.city,
  ...(l.place.area ? { area: l.place.area } : {}),
})

/** Combinations linked from the home page and listed in the sitemap. */
export function popularLandings(): { tx: Transaction; category: Category | null; place: string }[] {
  const out: { tx: Transaction; category: Category | null; place: string }[] = []
  for (const city of CITIES) {
    for (const category of ['house', 'land', 'apartment', 'commercial', null] as (Category | null)[]) out.push({ tx: 'sale', category, place: city.city })
    for (const category of ['apartment', 'house', 'room', 'commercial', null] as (Category | null)[]) out.push({ tx: 'rent', category, place: city.city })
  }
  for (const a of AREAS) {
    out.push({ tx: 'sale', category: 'house', place: a.area! }, { tx: 'sale', category: 'land', place: a.area! }, { tx: 'rent', category: null, place: a.area! })
  }
  return out
}
