'use client'
import clsx from 'clsx'
import { BellPlus, List, Loader2, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { countActiveFilters, filtersToQuery, SORTS, type Filters, type Sort } from '@/lib/filters'
import { useI18n } from '@/lib/i18n/client'
import { locate, whereLabel } from '@/lib/locations'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { PropertyCard as Card, SearchResult } from '@/lib/types'
import { CATEGORIES, TRANSACTIONS } from '@/lib/types'
import { FilterSheet } from './FilterSheet'
import { PropertyMap, type BBox } from './map'
import { PropertyCard } from './PropertyCard'
import { toast } from './Toaster'
import { Alert, Button, EmptyState } from './ui'

interface Props {
  filters: Filters
  initial: SearchResult
  view: 'list' | 'map'
  isPremium: boolean
  isSignedIn: boolean
  pageSize: number
  notice: 'advancedRemoved' | 'error' | null
}

export function SearchView({ filters, initial, view, isPremium, isSignedIn, pageSize, notice }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [items, setItems] = useState<Card[]>(initial.items)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const navigate = useCallback(
    (f: Filters, nextView: 'list' | 'map' = view) => {
      router.push(`/search?${filtersToQuery(f, { view: nextView === 'map' ? 'map' : undefined })}`)
    },
    [router, view],
  )

  async function loadMore() {
    setLoadingMore(true)
    const { data } = await supabaseBrowser().rpc('search_properties', { p_filters: filters, p_limit: pageSize, p_offset: items.length })
    setItems((list) => [...list, ...(((data as SearchResult | null)?.items) ?? [])])
    setLoadingMore(false)
  }

  async function saveSearch() {
    if (!isSignedIn) return router.push(`/login?next=${encodeURIComponent(`/search?${filtersToQuery(filters)}`)}`)
    if (!isPremium) return toast({ text: t('savedSearch.premiumOnly'), action: { label: t('premium.upgrade'), href: '/membership' } })
    const name = [filters.category ? t(`categoryPlural.${filters.category}`) : t('search.allProperties'), whereLabel(filters)].filter(Boolean).join(' · ')
    const supabase = supabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    const { sort: _sort, ...rest } = filters
    void _sort
    const { error } = await supabase.from('saved_searches').insert({ user_id: session?.user.id, name, filters: rest })
    toast(error ? { text: t('error.generic'), tone: 'error' } : { text: t('savedSearch.saved'), tone: 'success', action: { label: t('nav.saved'), href: '/saved' } })
  }

  const where = whereLabel(filters)
  const heading = filters.bbox && !where ? t('search.inMapArea') : where ? t('search.titleIn', { where }) : t('search.title')
  const activeCount = countActiveFilters(filters)

  return (
    <div className={clsx(view === 'map' && 'flex h-[calc(100dvh-5.5rem-4.5rem)] flex-col md:h-[calc(100dvh-5.5rem)]')}>
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFiltersOpen(true)} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 text-left ring-1 ring-gray-300">
            <Search className="size-5 shrink-0 text-gray-400" />
            <span className="truncate text-[15px] font-medium text-gray-900">{where || t('search.anywhere')}</span>
          </button>
          <button type="button" onClick={() => setFiltersOpen(true)} className="relative flex h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-gray-300">
            <SlidersHorizontal className="size-5" />
            <span className="hidden sm:inline">{t('filters.title')}</span>
            {activeCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeCount}</span>}
          </button>
          <div role="group" aria-label={t('search.view')} className="flex h-11 rounded-xl bg-gray-200/70 p-1">
            {(['list', 'map'] as const).map((v) => {
              const Icon = v === 'list' ? List : MapIcon
              return (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => navigate(filters, v)}
                  className={clsx('flex items-center gap-1 rounded-lg px-2.5 text-sm font-semibold', view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
                  <Icon className="size-4" /><span className="hidden sm:inline">{t(v === 'list' ? 'search.list' : 'search.map')}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          <div role="group" aria-label={t('filters.transaction')} className="flex h-9 shrink-0 rounded-full bg-gray-200/70 p-0.5">
            {TRANSACTIONS.map((tx) => (
              <button key={tx} type="button" aria-pressed={filters.transaction === tx}
                onClick={() => navigate({ ...filters, transaction: filters.transaction === tx ? undefined : tx, category: tx === 'sale' && filters.category === 'room' ? undefined : filters.category, min_price: undefined, max_price: undefined })}
                className={clsx('rounded-full px-3.5 text-sm font-bold', filters.transaction === tx ? 'bg-brand-600 text-white' : 'text-gray-700')}>
                {t(`transaction.${tx}`)}
              </button>
            ))}
          </div>
          {[undefined, ...CATEGORIES.filter((c) => c !== 'room' || filters.transaction !== 'sale')].map((c) => (
            <button key={c ?? 'all'} type="button" aria-pressed={filters.category === c} onClick={() => navigate({ ...filters, category: c })}
              className={clsx('h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ring-1', filters.category === c ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300')}>
              {c ? t(`categoryPlural.${c}`) : t('filters.all')}
            </button>
          ))}
          {filters.bbox && (
            <button type="button" onClick={() => navigate({ ...filters, bbox: undefined })} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
              {t('search.mapArea')} <X className="size-4" />
            </button>
          )}
        </div>

        {notice === 'advancedRemoved' && <Alert tone="warning">{t('search.advancedRemoved')}</Alert>}
        {notice === 'error' && <Alert tone="error">{t('error.generic')}</Alert>}
      </div>

      {view === 'list' ? (
        <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{heading}</h1>
              <p className="text-sm text-gray-500">{t('search.count', { n: initial.total })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={saveSearch}><BellPlus className="size-4" />{t('savedSearch.save')}</Button>
              <label className="sr-only" htmlFor="sort">{t('search.sort')}</label>
              <select id="sort" value={filters.sort ?? 'newest'} onChange={(e) => navigate({ ...filters, sort: e.target.value as Sort })}
                className="h-9 rounded-lg bg-white px-2 text-sm font-medium ring-1 ring-gray-300">
                {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
              </select>
            </div>
          </div>
          {items.length === 0 ? (
            <EmptyState icon={<Search className="size-10" />} title={t('search.emptyTitle')} text={t('search.emptyText')}
              action={<Button variant="secondary" onClick={() => navigate({ country: filters.country, city: filters.city })}>{t('filters.reset')}</Button>} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => <PropertyCard key={p.id} property={p} />)}
            </div>
          )}
          {items.length < initial.total && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="size-4 animate-spin" />}{t('search.loadMore')}
              </Button>
            </div>
          )}
        </section>
      ) : (
        <MapResults filters={filters} onSearchArea={(bbox) => navigate({ ...filters, area: undefined, city: undefined, bbox }, 'list')} />
      )}

      <FilterSheet key={filtersOpen ? 'open' : 'closed'} open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} isPremium={isPremium}
        onApply={(f) => {
          setFiltersOpen(false)
          navigate(f)
        }} />
    </div>
  )
}

/** Map mode: markers follow the visible area; "Search this area" turns the viewport into the search. */
function MapResults({ filters, onSearchArea }: { filters: Filters; onSearchArea: (bbox: BBox) => void }) {
  const { t } = useI18n()
  const [markers, setMarkers] = useState<Card[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [bbox, setBbox] = useState<BBox | null>(null)
  const [moved, setMoved] = useState(false)
  const loads = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = useMemo(() => (filters.near
    ? { lat: filters.near[0], lng: filters.near[1], zoom: (filters.radius_km ?? 5) > 5 ? 11 : 13 }
    : locate(filters)), [filters])

  const load = useCallback(
    (box: BBox) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        const id = ++loads.current
        const { data } = await supabaseBrowser().rpc('search_properties', { p_filters: { ...filters, bbox: box }, p_limit: 300 })
        if (id !== loads.current) return
        const result = (data as SearchResult | null) ?? { total: 0, items: [] }
        setMarkers(result.items)
        setTotal(result.total)
      }, 250)
    },
    [filters],
  )
  useEffect(() => () => clearTimeout(timer.current), [])

  const selectedCard = markers.find((m) => m.id === selected)

  return (
    <div className="relative -mx-4 mt-3 min-h-80 flex-1 overflow-hidden md:mx-0 md:rounded-2xl">
      <PropertyMap
        properties={markers}
        center={[start.lat, start.lng]}
        zoom={start.zoom}
        bounds={filters.bbox}
        selectedId={selected}
        onSelect={setSelected}
        onMoveEnd={(box) => {
          if (bbox) setMoved(true)
          setBbox(box)
          load(box)
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        {moved && bbox ? (
          <button type="button" onClick={() => onSearchArea(bbox)} className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-bold text-white shadow-lg">
            <Search className="size-4" /> {t('search.searchThisArea')}
          </button>
        ) : total !== null ? (
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-gray-800 shadow">{t('search.count', { n: total })}</span>
        ) : null}
      </div>
      {selectedCard && (
        <div className="absolute inset-x-3 bottom-3 mx-auto max-w-md">
          <PropertyCard property={selectedCard} compact />
        </div>
      )}
    </div>
  )
}
