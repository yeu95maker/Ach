import { CalendarDays, Clock3, MapPin, StickyNote } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { ShiftIcon } from '@/components/ShiftIcon'
import { durationMinutes } from '@/domain/schedule'
import type { DayAgenda } from '@/domain/schedule'
import type { RosterEntry } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { EmptyState, cn } from '@/ui'
import { ShiftColleagues } from './ShiftColleagues'

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
      <span className="text-text-3 [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-3">{label}</p>
        <p className="truncate text-[15px] font-semibold tabular">{value}</p>
      </div>
    </div>
  )
}

function ShiftBlock({ entry }: { entry: RosterEntry }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const kind = entry.kind === 'off' ? 'off' : (entry.shiftType?.category ?? 'other')
  const s = dayKindStyles[kind]

  return (
    <section className="space-y-5">
      <div className={cn('flex items-center gap-4 rounded-3xl p-5', s.soft)}>
        <span className={cn('flex size-14 items-center justify-center rounded-2xl bg-surface/70', s.text)}>
          <ShiftIcon kind={kind} className="size-7" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-xl font-bold tracking-tight', s.text)}>
            {entry.kind === 'off' ? t('dayKind.off') : (entry.shiftType?.name ?? t(`dayKind.${kind}`))}
          </p>
          {entry.startsAt && entry.endsAt && <p className={cn('text-[15px] font-medium tabular opacity-90', s.text)}>{fmt.timeRange(entry.startsAt, entry.endsAt)}</p>}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Fact icon={<CalendarDays />} label={t('schedule.date')} value={fmt.dateLong(entry.date)} />
        <Fact icon={<MapPin />} label={t('schedule.unit')} value={entry.unitName} />
        {entry.startsAt && entry.endsAt && (
          <Fact icon={<Clock3 />} label={t('schedule.time')} value={`${fmt.timeRange(entry.startsAt, entry.endsAt)} · ${fmt.hours(durationMinutes(entry))}`} />
        )}
        {entry.note && <Fact icon={<StickyNote />} label={t('schedule.note')} value={entry.note} />}
      </div>

      {entry.kind === 'shift' && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-text-3 uppercase">{t('schedule.colleaguesOnShift')}</h3>
          <ShiftColleagues entry={entry} />
        </div>
      )}
    </section>
  )
}

export function DayDetail({ day }: { day: DayAgenda }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()

  return (
    <div className="space-y-8">
      {day.absence && (
        <div className={cn('flex items-center gap-4 rounded-3xl p-5', dayKindStyles[day.absence.kind].soft)}>
          <span className={cn('flex size-14 items-center justify-center rounded-2xl bg-surface/70', dayKindStyles[day.absence.kind].text)}>
            <ShiftIcon kind={day.absence.kind} className="size-7" />
          </span>
          <div>
            <p className={cn('text-xl font-bold', dayKindStyles[day.absence.kind].text)}>
              {day.absence.kind === 'vacation' && day.absence.leaveType ? t(`leaveType.${day.absence.leaveType}`) : t(`dayKind.${day.absence.kind}`)}
            </p>
            <p className={cn('text-[15px] opacity-90', dayKindStyles[day.absence.kind].text)}>{fmt.dateRange(day.absence.startDate, day.absence.endDate)}</p>
          </div>
        </div>
      )}
      {day.entries.map((e) => (
        <ShiftBlock key={e.id} entry={e} />
      ))}
      {!day.absence && day.entries.length === 0 && (
        <EmptyState icon={<CalendarDays />} title={t('schedule.nothingPlanned')} description={t('schedule.nothingPlannedHint')} />
      )}
    </div>
  )
}
