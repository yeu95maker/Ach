import { ArrowRight, CalendarClock, Newspaper } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { splitFeed } from '@/domain/news'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Card, CardHeader, EmptyState, cn } from '@/ui'
import { NEWS_STYLE } from './newsStyles'
import { useNewsFeed } from './useNews'

/** Dashboard card: next dates first, then the latest information. */
export function NewsPreview() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const feed = useNewsFeed(30)
  const items = useMemo(() => {
    const { upcoming, latest } = splitFeed(feed.data ?? [])
    return [...upcoming.slice(0, 2), ...latest.slice(0, upcoming.length ? 2 : 3)]
  }, [feed.data])

  if (feed.isLoading || feed.error) return null

  return (
    <Card>
      <CardHeader
        title={t('news.title')}
        action={
          <Link to="/news" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">
            {t('common.seeAll')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState compact icon={<Newspaper />} title={t('news.empty')} />
      ) : (
        <ul className="space-y-4">
          {items.map((n) => {
            const style = NEWS_STYLE[n.category]
            return (
              <li key={n.id}>
                <Link to={`/news?category=${n.category}`} className="flex gap-3 rounded-xl transition-opacity hover:opacity-80">
                  <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', style.tone)}>
                    <style.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] leading-snug font-semibold">{n.title}</span>
                      {n.priority === 'important' && <Badge tone="warning">{t('dashboard.important')}</Badge>}
                    </span>
                    {n.eventStartsAt ? (
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm text-text-2 tabular">
                        <CalendarClock className="size-3.5 text-text-3" aria-hidden />
                        {fmt.eventTime(n.eventStartsAt, n.eventEndsAt)}
                      </span>
                    ) : (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-text-2">{n.body}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-text-3">
                      {t(`news.category.${n.category}`)} · {fmt.relative(n.publishedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
