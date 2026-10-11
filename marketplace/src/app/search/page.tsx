import type { Metadata } from 'next'
import { SearchView } from '@/components/SearchView'
import { getAccount } from '@/lib/account'
import { parseFilters, usesAdvancedFilters, withoutAdvancedFilters } from '@/lib/filters'
import { getT } from '@/lib/i18n/server'
import { whereLabel } from '@/lib/locations'
import { createClient } from '@/lib/supabase/server'
import type { SearchResult } from '@/lib/types'

const PAGE_SIZE = 24

export async function generateMetadata({ searchParams }: PageProps<'/search'>): Promise<Metadata> {
  const { t } = await getT()
  const where = whereLabel(parseFilters(await searchParams))
  return { title: where ? t('search.titleIn', { where }) : t('search.title') }
}

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const params = await searchParams
  const account = await getAccount()
  const isPremium = !!(account?.is_premium || account?.is_admin)
  let filters = parseFilters(params)
  const strippedAdvanced = !isPremium && usesAdvancedFilters(filters)
  if (strippedAdvanced) filters = withoutAdvancedFilters(filters)
  const view = params.view === 'map' ? 'map' : 'list'

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_properties', { p_filters: filters, p_limit: PAGE_SIZE, p_offset: 0 })
  const result = (data as SearchResult | null) ?? { total: 0, items: [] }

  return (
    <SearchView
      key={JSON.stringify(filters)}
      filters={filters}
      initial={result}
      view={view}
      isPremium={isPremium}
      isSignedIn={!!account}
      pageSize={PAGE_SIZE}
      notice={strippedAdvanced ? 'advancedRemoved' : error ? 'error' : null}
    />
  )
}
