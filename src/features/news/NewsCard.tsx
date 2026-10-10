import { CalendarClock, MapPin, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NewsItem } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Card, IconButton, cn } from '@/ui'
import { NEWS_STYLE } from './newsStyles'

export function NewsCard({ item, onRemove, compact }: { item: NewsItem; onRemove?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const style = NEWS_STYLE[item.category]

  return (
    <Card padding="sm" className="sm:p-5">
      <div className="flex gap-3.5">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', style.tone)}>
          <style.icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-text-3 uppercase">{t(`news.category.${item.category}`)}</span>
            {item.priority === 'important' && <Badge tone="warning">{t('dashboard.important')}</Badge>}
            <span className="ml-auto text-xs text-text-3">{fmt.relative(item.publishedAt)}</span>
          </div>
          <h3 className="mt-1 text-[16px] leading-snug font-semibold">{item.title}</h3>

          {item.eventStartsAt && (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-text-2">
              <span className="inline-flex items-center gap-1.5 tabular">
                <CalendarClock className="size-4 text-text-3" aria-hidden />
                {fmt.eventTime(item.eventStartsAt, item.eventEndsAt)}
              </span>
              {item.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-text-3" aria-hidden />
                  {item.location}
                </span>
              )}
            </p>
          )}

          <p className={cn('mt-2 text-sm whitespace-pre-line text-text-2', compact && 'line-clamp-2')}>{item.body}</p>
          <p className="mt-2 text-xs text-text-3">{item.unitName ?? t('news.wholeHospital')}</p>
        </div>
        {onRemove && (
          <IconButton label={t('news.remove')} variant="ghost" onClick={onRemove} className="-mt-1 -mr-1 shrink-0">
            <Trash2 className="size-[18px]" />
          </IconButton>
        )}
      </div>
    </Card>
  )
}
