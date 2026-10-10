import { CalendarClock, Newspaper, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { QueryError, Stagger } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { NEWS_CATEGORIES, splitFeed } from '@/domain/news'
import { can } from '@/domain/permissions'
import type { NewsCategory, NewsItem } from '@/domain/types'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Card, EmptyState, PageHeader, SectionTitle, Sheet, SkeletonCard, cn, useToast } from '@/ui'
import { ComposeNewsSheet } from './ComposeNewsSheet'
import { NewsCard } from './NewsCard'
import { useNewsFeed, useNewsTargets, useRemoveNews } from './useNews'

const isCategory = (v: string | null): v is NewsCategory => !!v && (NEWS_CATEGORIES as readonly string[]).includes(v)

export function NewsPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const user = useCurrentUser()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filter = isCategory(params.get('category')) ? (params.get('category') as NewsCategory) : null
  const [composing, setComposing] = useState(false)
  const [removing, setRemoving] = useState<NewsItem | null>(null)

  const feed = useNewsFeed()
  const targets = useNewsTargets()
  const remove = useRemoveNews()
  const canPublish = can(employment, 'announcements.publish') && (targets.data?.length ?? 0) > 0

  const { upcoming, latest } = useMemo(() => splitFeed((feed.data ?? []).filter((n) => !filter || n.category === filter)), [feed.data, filter])
  const present = useMemo(() => new Set((feed.data ?? []).map((n) => n.category)), [feed.data])

  const canRemove = (n: NewsItem) => canPublish && (n.authorId === user.id || targets.data?.some((x) => x.unitId === n.unitId))

  const setFilter = (c: NewsCategory | null) => setParams(c ? { category: c } : {}, { replace: true })

  return (
    <>
      <PageHeader
        title={t('news.title')}
        subtitle={t('news.subtitle')}
        actions={
          canPublish ? (
            <Button icon={<Plus className="size-[18px]" />} onClick={() => setComposing(true)}>
              {t('news.new')}
            </Button>
          ) : undefined
        }
      />

      <div role="toolbar" aria-label={t('news.filter')} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {[null, ...NEWS_CATEGORIES.filter((c) => present.has(c))].map((c) => (
          <button
            key={c ?? 'all'}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(c)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors',
              filter === c ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-text-2 shadow-sm ring-1 ring-border/70 hover:text-text',
            )}
          >
            {c ? t(`news.category.${c}`) : t('news.all')}
          </button>
        ))}
      </div>

      {feed.isLoading && <SkeletonCard lines={4} />}
      {feed.error && <QueryError error={feed.error} onRetry={() => void feed.refetch()} />}

      {feed.data && upcoming.length + latest.length === 0 && (
        <Card>
          <EmptyState icon={<Newspaper />} title={t('news.empty')} description={canPublish ? t('news.emptyManager') : undefined} />
        </Card>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="size-4" aria-hidden />
              {t('news.upcoming')}
            </span>
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {upcoming.map((n, i) => (
              <Stagger key={n.id} index={i}>
                <NewsCard item={n} onRemove={canRemove(n) ? () => setRemoving(n) : undefined} />
              </Stagger>
            ))}
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section>
          <SectionTitle>{t('news.latest')}</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {latest.map((n, i) => (
              <Stagger key={n.id} index={i}>
                <NewsCard item={n} onRemove={canRemove(n) ? () => setRemoving(n) : undefined} />
              </Stagger>
            ))}
          </div>
        </section>
      )}

      {canPublish && <ComposeNewsSheet open={composing} onClose={() => setComposing(false)} />}

      <Sheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        closeLabel={t('common.close')}
        title={t('news.removeTitle')}
        description={removing?.title}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.show({ tone: 'success', title: t('news.removed') })
                    setRemoving(null)
                  },
                  onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
                })
              }
            >
              {t('news.remove')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-2">{t('news.removeHint')}</p>
      </Sheet>
    </>
  )
}
