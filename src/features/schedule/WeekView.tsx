import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { ShiftIcon } from '@/components/ShiftIcon'
import type { DayAgenda } from '@/domain/schedule'
import type { ISODate } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { cn } from '@/ui'

export function WeekView({ agenda, today, onSelect }: { agenda: DayAgenda[]; today: ISODate; onSelect: (d: DayAgenda) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()

  return (
    <ol className="grid gap-2.5 lg:grid-cols-7 lg:gap-3">
      {agenda.map((d, i) => {
        const s = d.kind ? dayKindStyles[d.kind] : null
        const shift = d.entries.find((e) => e.kind === 'shift')
        const isToday = d.date === today
        return (
          <li key={d.date} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'flex w-full items-center gap-4 rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] lg:min-h-48 lg:flex-col lg:items-stretch',
                isToday ? 'border-primary/40 ring-2 ring-primary/15' : 'border-border/70',
              )}
            >
              <span className="flex w-12 shrink-0 flex-col items-center lg:w-auto lg:flex-row lg:justify-between">
                <span className="text-xs font-semibold text-text-3 uppercase">{fmt.weekdayShort(d.date)}</span>
                <span className={cn('flex size-9 items-center justify-center rounded-full text-lg font-bold tabular', isToday && 'bg-primary text-on-primary')}>
                  {fmt.dayNumber(d.date)}
                </span>
              </span>
              <span className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 lg:flex-col lg:items-start lg:justify-end', s ? s.soft : 'bg-surface-2/60')}>
                {d.kind ? (
                  <>
                    <ShiftIcon kind={d.kind} className={cn('size-5 shrink-0', s?.text)} />
                    <span className="min-w-0">
                      <span className={cn('block truncate text-[15px] font-semibold', s?.text)}>
                        {d.absence ? t(`dayKind.${d.absence.kind}`) : shift ? (shift.shiftType?.name ?? t(`dayKind.${d.kind}`)) : t('dayKind.off')}
                      </span>
                      {!d.absence && shift?.startsAt && shift.endsAt && (
                        <span className={cn('block text-sm tabular opacity-80', s?.text)}>{fmt.timeRange(shift.startsAt, shift.endsAt)}</span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-text-3">{t('schedule.nothingPlanned')}</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
