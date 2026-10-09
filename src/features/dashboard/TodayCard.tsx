import { ArrowRight, Clock3, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dayKindStyles } from '@/components/dayKindStyles'
import { ShiftIcon } from '@/components/ShiftIcon'
import { durationMinutes, isOnDuty } from '@/domain/schedule'
import type { DashboardSummary, DayKind, RosterEntry } from '@/domain/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Card, cn } from '@/ui'

function useShiftStatus(entry: RosterEntry, now: Date) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  if (!entry.startsAt || !entry.endsAt) return null
  if (isOnDuty(entry, now)) return { label: t('dashboard.runningUntil', { time: fmt.time(entry.endsAt) }), live: true }
  if (entry.startsAt > now) return { label: t('dashboard.startsRelative', { when: fmt.relative(entry.startsAt, now) }), live: false }
  return { label: t('dashboard.finished'), live: false }
}

function ShiftHero({ entry, label }: { entry: RosterEntry; label: string }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const kind: DayKind = entry.shiftType?.category ?? 'other'
  const s = dayKindStyles[kind]
  const status = useShiftStatus(entry, new Date())

  return (
    <Link
      to={`/schedule?date=${entry.date}&view=day`}
      className="group block rounded-[var(--radius-card)] border border-border/70 bg-surface p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-text-3">{label}</span>
        {status && (
          <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold', s.soft, s.text)}>
            {status.live && (
              <span className="relative flex size-2">
                <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', s.dot)} />
                <span className={cn('relative inline-flex size-2 rounded-full', s.dot)} />
              </span>
            )}
            {status.label}
          </span>
        )}
      </div>
      <div className="mt-5 flex items-center gap-4 sm:gap-5">
        <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16', s.soft, s.text)}>
          <ShiftIcon kind={kind} className="size-7 sm:size-8" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold tracking-tight sm:text-[28px]">{entry.shiftType?.name ?? t(`dayKind.${kind}`)}</p>
          {entry.startsAt && entry.endsAt && (
            <p className="mt-0.5 text-[17px] font-medium text-text-2 tabular">{fmt.timeRange(entry.startsAt, entry.endsAt)}</p>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-sm text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 text-text-3" aria-hidden />
          {entry.unitName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-4 text-text-3" aria-hidden />
          {fmt.hours(durationMinutes(entry))}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary-text">
          {t('dashboard.seeColleagues')}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

function CalmCard({ kind, title, text }: { kind: DayKind; title: string; text: string }) {
  const s = dayKindStyles[kind]
  return (
    <Card className="flex items-center gap-5 sm:p-7">
      <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16', s.soft, s.text)}>
        <ShiftIcon kind={kind} className="size-7 sm:size-8" />
      </span>
      <div>
        <p className="text-sm font-semibold text-text-3">{title}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight">{text}</p>
      </div>
    </Card>
  )
}

export function TodayCard({ data }: { data: DashboardSummary }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const shift = data.todayEntries.find((e) => e.kind === 'shift' && (!e.endsAt || e.endsAt > new Date()))

  if (data.absenceToday) {
    return (
      <CalmCard
        kind={data.absenceToday.kind}
        title={t('dashboard.today')}
        text={
          data.absenceToday.kind === 'sick'
            ? t('dashboard.sickUntil', { date: fmt.dateShort(data.absenceToday.endDate) })
            : t('dashboard.vacationUntil', { date: fmt.dateShort(data.absenceToday.endDate) })
        }
      />
    )
  }
  if (shift) return <ShiftHero entry={shift} label={t('dashboard.today')} />
  return <CalmCard kind="off" title={t('dashboard.today')} text={t('dashboard.noShiftToday')} />
}

export function NextShiftCard({ entry }: { entry: RosterEntry | null }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  if (!entry) {
    return (
      <Card>
        <p className="text-sm font-semibold text-text-3">{t('dashboard.nextShift')}</p>
        <p className="mt-2 text-[15px] text-text-2">{t('dashboard.noUpcomingShift')}</p>
      </Card>
    )
  }
  const kind: DayKind = entry.shiftType?.category ?? 'other'
  const s = dayKindStyles[kind]
  return (
    <Link
      to={`/schedule?date=${entry.date}&view=day`}
      className="flex items-center gap-4 rounded-[var(--radius-card)] border border-border/70 bg-surface p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
    >
      <span className={cn('flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl', s.soft, s.text)}>
        <span className="text-[11px] leading-none font-semibold uppercase">{fmt.weekdayShort(entry.date)}</span>
        <span className="text-lg leading-tight font-bold tabular">{fmt.dayNumber(entry.date)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-3">{t('dashboard.nextShift')}</p>
        <p className="truncate text-[17px] font-semibold">{entry.shiftType?.name ?? t(`dayKind.${kind}`)}</p>
        {entry.startsAt && entry.endsAt && <p className="text-sm text-text-2 tabular">{fmt.timeRange(entry.startsAt, entry.endsAt)} · {entry.unitName}</p>}
      </div>
      <ArrowRight className="size-5 shrink-0 text-text-3" aria-hidden />
    </Link>
  )
}
