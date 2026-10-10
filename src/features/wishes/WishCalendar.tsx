import { eachDayOfInterval, endOfWeek, startOfWeek } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fromISODate, isWithin, toISODate, WEEK_STARTS_ON } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import type { Wish } from '@/domain/wishes'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { cn } from '@/ui'
import { WishIcon, WishStatusDot, wishStyles } from './wishStyles'

/** Calendar of one wish period. Tap a day to apply the selected wish. */
export function WishCalendar({
  periodStart,
  periodEnd,
  wishes,
  today,
  shiftCodes,
  onDayTap,
  interactive,
}: {
  periodStart: ISODate
  periodEnd: ISODate
  wishes: ReadonlyMap<ISODate, Wish>
  today: ISODate
  shiftCodes: ReadonlyMap<string, string>
  onDayTap: (date: ISODate) => void
  interactive: boolean
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(fromISODate(periodStart), { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(fromISODate(periodEnd), { weekStartsOn: WEEK_STARTS_ON }),
      }).map(toISODate),
    [periodStart, periodEnd],
  )

  return (
    <div className="rounded-[var(--radius-card)] border border-border/70 bg-surface p-2 shadow-card sm:p-4">
      <div className="grid grid-cols-7 pb-1" aria-hidden>
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-text-3 uppercase">
            <span className="sm:hidden">{fmt.weekdayNarrow(d)}</span>
            <span className="hidden sm:inline">{fmt.weekdayShort(d)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={t('wishes.calendarLabel')}>
        {days.map((d) => {
          const inPeriod = isWithin(d, periodStart, periodEnd)
          if (!inPeriod) return <div key={d} aria-hidden />
          const wish = wishes.get(d)
          const s = wish ? wishStyles[wish.type] : null
          const weekend = [0, 6].includes(fromISODate(d).getDay())
          const label = wish ? `${fmt.dateLong(d)}: ${t(`wishType.${wish.type}`)}` : `${fmt.dateLong(d)}: ${t('wishes.noWish')}`
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              onClick={() => onDayTap(d)}
              aria-label={label}
              aria-pressed={!!wish}
              className={cn(
                'relative flex aspect-square min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-[15px] font-semibold tabular transition-[background-color,transform,box-shadow] duration-150 select-none sm:aspect-auto sm:h-20',
                interactive && 'active:scale-90',
                s ? cn(s.soft, s.text) : cn(weekend ? 'bg-surface-2/80' : 'bg-surface-2/40', 'text-text', interactive && 'hover:bg-surface-3'),
                d === today && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
              )}
            >
              <span className={cn(wish ? 'text-[13px] leading-none' : '')}>{fmt.dayNumber(d)}</span>
              {wish && (
                <>
                  <WishIcon type={wish.type} className="size-[18px] sm:size-5" />
                  {wish.type === 'preferred' && wish.shiftTypeId && (
                    <span className="text-[10px] leading-none font-bold">{shiftCodes.get(wish.shiftTypeId)}</span>
                  )}
                  {wish.note && <span className="absolute top-1.5 left-1.5 size-1.5 rounded-full bg-current opacity-60" aria-hidden />}
                </>
              )}
              {wish?.status && <WishStatusDot status={wish.status} className="absolute -top-1 -right-1" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
