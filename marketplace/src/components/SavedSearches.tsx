'use client'
import { Bell, BellOff, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { filtersToQuery, parseFilters } from '@/lib/filters'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'

export interface SavedSearch {
  id: string
  name: string
  filters: Record<string, unknown>
  alerts_enabled: boolean
  created_at: string
}

/** Saved filters are stored in the database format; turn them into a /search URL. */
function searchUrl(filters: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v !== null && v !== undefined) params.set(k, Array.isArray(v) ? v.join(',') : String(v))
  return `/search?${filtersToQuery(parseFilters(params))}`
}

export function SavedSearches({ items }: { items: SavedSearch[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = supabaseBrowser()
  async function toggle(s: SavedSearch) {
    await supabase.from('saved_searches').update({ alerts_enabled: !s.alerts_enabled }).eq('id', s.id)
    router.refresh()
  }
  async function remove(s: SavedSearch) {
    await supabase.from('saved_searches').delete().eq('id', s.id)
    router.refresh()
  }
  return (
    <ul className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200/70">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
          <Search className="size-5 shrink-0 text-gray-400" />
          <Link href={searchUrl(s.filters)} className="min-w-0 flex-1 truncate font-semibold text-gray-900 hover:underline">{s.name}</Link>
          <button type="button" onClick={() => toggle(s)} aria-pressed={s.alerts_enabled} title={t(s.alerts_enabled ? 'savedSearch.alertsOn' : 'savedSearch.alertsOff')}
            className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
            {s.alerts_enabled ? <Bell className="size-5 text-brand-600" /> : <BellOff className="size-5" />}
            <span className="sr-only">{t(s.alerts_enabled ? 'savedSearch.alertsOn' : 'savedSearch.alertsOff')}</span>
          </button>
          <button type="button" onClick={() => remove(s)} aria-label={t('common.delete')} className="rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-700">
            <Trash2 className="size-5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
