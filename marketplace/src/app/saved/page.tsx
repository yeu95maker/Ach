import { Heart, Lock } from 'lucide-react'
import type { Metadata } from 'next'
import { PropertyCard } from '@/components/PropertyCard'
import { SavedSearches, type SavedSearch } from '@/components/SavedSearches'
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui'
import { requireAccount } from '@/lib/account'
import { getT } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import type { AppSettings, PropertyCard as CardType } from '@/lib/types'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('saved.title') }
}

export default async function SavedPage() {
  const account = await requireAccount('/saved')
  const { t } = await getT()
  const supabase = await createClient()
  const premium = account.is_premium
  const [favorites, searches, settings] = await Promise.all([
    supabase.rpc('list_favorites'),
    supabase.from('saved_searches').select('id, name, filters, alerts_enabled, created_at').order('created_at', { ascending: false }),
    supabase.from('app_settings').select('free_favorites_limit').single(),
  ])
  const items = (favorites.data as CardType[] | null) ?? []
  const limit = (settings.data as Pick<AppSettings, 'free_favorites_limit'> | null)?.free_favorites_limit ?? 10

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('saved.title')}
        subtitle={premium ? t('saved.unlimited') : t('saved.limit', { n: account.favorites_count, limit })}
      />
      <section>
        {items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => <PropertyCard key={p.id} property={p} />)}</div>
        ) : (
          <EmptyState icon={<Heart className="size-10" />} title={t('saved.emptyTitle')} text={t('saved.emptyText')} action={<LinkButton href="/search">{t('home.search')}</LinkButton>} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold text-gray-900">{t('savedSearch.title')}</h2>
        {premium ? (
          (searches.data?.length ?? 0) > 0 ? <SavedSearches items={searches.data as SavedSearch[]} /> : <EmptyState title={t('savedSearch.emptyTitle')} text={t('savedSearch.emptyText')} />
        ) : (
          <Card className="flex flex-col items-start gap-3 p-5">
            <p className="inline-flex items-center gap-2 font-semibold text-gray-900"><Lock className="size-4 text-gold-700" />{t('savedSearch.premiumOnly')}</p>
            <p className="text-sm text-gray-600">{t('savedSearch.premiumText')}</p>
            <LinkButton href="/membership" variant="premium">{t('premium.upgrade')}</LinkButton>
          </Card>
        )}
      </section>
    </div>
  )
}
