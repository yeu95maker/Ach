import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { ShiftIcon } from '@/components/ShiftIcon'
import { fromISODate, isSameMonth } from '@/domain/dates'
import type { DayAgenda } from '@/domain/schedule'
import type { ISODate } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { cn } from '@/ui'

export function MonthView({ agenda, anchor, today, onSelect }: { agenda: DayAgenda[]; anchor: ISODate; today: ISODate; onSelect: (d: DayAgenda) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const anchorDate = fromISODate(anchor)

  return (
    <div className="rounded-[var(--radius-card)] border border-border/70 bg-surface p-2 shadow-card sm:p-4">
      <div className="grid grid-cols-7 pb-2" aria-hidden>
        {agenda.slice(0, 7).map((d) => (
          <div key={d.date} className="py-2 text-center text-xs font-semibold text-text-3 uppercase">
            <span className="sm:hidden">{fmt.weekdayNarrow(d.date)}</span>
            <span className="hidden sm:inline">{fmt.weekdayShort(d.date)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {agenda.map((d, i) => {
          const inMonth = isSameMonth(d.date, anchorDate)
          const isToday = d.date === today
          const s = d.kind ? dayKindStyles[d.kind] : null
          const shift = d.entries.find((e) => e.kind === 'shift')
          const label = d.absence ? t(`dayKind.${d.absence.kind}`) : shift ? (shift.shiftType?.name ?? '') : d.kind === 'off' ? t('dayKind.off') : t('schedule.nothingPlanned')
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d)}
              aria-label={`${fmt.dateLong(d.date)}: ${label}`}
              className={cn(
                'group relative flex aspect-[4/5] min-h-14 animate-fade-in flex-col items-center rounded-2xl p-1 transition-[background-color,transform] duration-150 active:scale-95 sm:aspect-auto sm:h-24 sm:items-stretch sm:p-2',
                inMonth ? 'hover:bg-surface-2' : 'opacity-35 hover:opacity-60',
              )}
              style={{ animationDelay: `${Math.min(i, 41) * 6}ms` }}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center self-center rounded-full text-[13px] font-semibold tabular sm:self-start',
                  isToday ? 'bg-primary text-on-primary' : 'text-text',
                )}
              >
                {fmt.dayNumber(d.date)}
              </span>
              {s && d.kind && (
                <>
                  {/* phone: compact code chip */}
                  <span className={cn('mt-1 flex h-6 w-full max-w-9 items-center justify-center rounded-lg text-[11px] font-bold sm:hidden', s.soft, s.text)}>
                    {shift?.shiftType?.code && !d.absence ? shift.shiftType.code : <ShiftIcon kind={d.kind} className="size-3.5" />}
                  </span>
                  {/* tablet / desktop: labelled chip */}
                  <span className={cn('mt-auto hidden items-center gap-1.5 truncate rounded-lg px-2 py-1 text-xs font-semibold sm:flex', s.soft, s.text)}>
                    <ShiftIcon kind={d.kind} className="size-3.5 shrink-0" />
                    <span className="truncate">{d.absence ? t(`dayKind.${d.absence.kind}`) : shift ? (shift.shiftType?.code ?? '') + (shift.startsAt ? ` ${fmt.time(shift.startsAt)}` : '') : t('dayKind.off')}</span>
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
