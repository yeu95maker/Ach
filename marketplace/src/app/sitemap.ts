import type { MetadataRoute } from 'next'
import { landingPath, popularLandings, SITE_URL } from '@/lib/seo'
import { supabasePublic } from '@/lib/supabase/public'
import type { SearchResult } from '@/lib/types'

// Generated per request so new listings appear immediately (and builds don't need the database).
export const dynamic = 'force-dynamic'

/** Home, landing pages and every public (unlocked) active listing. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/for-providers`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/membership`, changeFrequency: 'monthly', priority: 0.3 },
    ...popularLandings().map((l) => ({ url: `${SITE_URL}${landingPath(l.tx, l.category, l.place)}`, changeFrequency: 'daily' as const, priority: 0.7 })),
  ]
  const supabase = supabasePublic()
  for (let offset = 0; offset < 50_000; offset += 500) {
    const { data } = await supabase.rpc('search_properties', { p_filters: {}, p_limit: 500, p_offset: offset })
    const page = (data as SearchResult | null)?.items ?? []
    for (const p of page) {
      if (!p.locked) entries.push({ url: `${SITE_URL}/properties/${p.id}`, lastModified: p.published_at ? new Date(p.published_at) : now, changeFrequency: 'weekly', priority: 0.8 })
    }
    if (page.length < 500) break
  }
  return entries
}
