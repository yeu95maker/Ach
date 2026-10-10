import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError, Stagger } from '@/components/QueryState'
import { historyRepository, type MonthHistory } from '@/data/historyRepository'
import { isoDateInTimeZone } from '@/domain/dates'
import type { ShiftCategory } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Card, EmptyState, IconButton, PageHeader, SkeletonCard, cn } from '@/ui'

const CATEGORIES: ShiftCategory[] = ['early', 'late', 'night', 'day', 'other']

function MonthCard({ m }: { m: MonthHistory }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const total = Math.max(1, m.shiftCount)
  return (
    <Link
      to={`/schedule?view=month&date=${m.month}`}
      className="block rounded-[var(--radius-card)] border border-border/70 bg-surface p-4 shadow-card transition-transform hover:-translate-y-0.5 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[16px] font-semibold capitalize">{fmt.monthYear(m.month)}</p>
        <ChevronRight className="size-4 text-text-3" aria-hidden />
      </div>
      {m.shiftCount === 0 && m.vacationDays === 0 ? (
        <p className="mt-2 text-sm text-text-3">{t('history.noShifts')}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-text-2">
            {t('schedule.stats', { count: m.shiftCount, hours: fmt.hours(m.shiftMinutes) })}
          </p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            {CATEGORIES.map((c) =>
              m.byCategory[c] ? <span key={c} className={dayKindStyles[c].solid} style={{ width: `${(m.byCategory[c]! / total) * 100}%` }} /> : null,
            )}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
            {CATEGORIES.filter((c) => m.byCategory[c]).map((c) => (
              <span key={c}>
                {t(`dayKind.${c}`)} {m.byCategory[c]}
              </span>
            ))}
            {m.vacationDays > 0 && <span>{t('history.vacationDays', { count: m.vacationDays })}</span>}
            {m.sickDays > 0 && <span>{t('history.sickDays', { count: m.sickDays })}</span>}
          </p>
        </>
      )}
    </Link>
  )
}

/** "Mein Verlauf": every month back to the first shift, year by year. */
export function HistoryPage() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const employment = useEmployment()
  const [params, setParams] = useSearchParams()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)
  const thisYear = Number(today.slice(0, 4))

  const start = useQuery({
    queryKey: queryKeys.historyStart(employment.employeeId),
    queryFn: () => historyRepository.fetchStart(employment.employeeId),
    staleTime: 10 * 60_000,
  })
  const firstYear = start.data ? Number(start.data.slice(0, 4)) : thisYear
  const year = Math.min(thisYear, Math.max(firstYear, Number(params.get('year')) || thisYear))

  const months = useQuery({
    queryKey: queryKeys.history(employment.employeeId, year),
    queryFn: () =>
      historyRepository.fetchMonths(employment.employeeId, `${year}-01-01`, year === thisYear ? today : `${year}-12-31`),
    enabled: start.isSuccess,
  })

  const totals = useMemo(
    () =>
      (months.data ?? []).reduce(
        (acc, m) => ({ shifts: acc.shifts + m.shiftCount, minutes: acc.minutes + m.shiftMinutes, vacation: acc.vacation + m.vacationDays }),
        { shifts: 0, minutes: 0, vacation: 0 },
      ),
    [months.data],
  )

  const go = (y: number) => setParams({ year: String(y) }, { replace: true })

  return (
    <>
      <Link to="/schedule" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('schedule.title')}
      </Link>
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle')} />

      {(start.error || months.error) && <QueryError error={start.error ?? months.error} onRetry={() => void months.refetch()} />}

      {start.isSuccess && !start.data ? (
        <Card>
          <EmptyState icon={<History />} title={t('history.empty')} />
        </Card>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <IconButton label={t('history.previousYear')} variant="secondary" disabled={year <= firstYear} onClick={() => go(year - 1)}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <IconButton label={t('history.nextYear')} variant="secondary" disabled={year >= thisYear} onClick={() => go(year + 1)}>
                <ChevronRight className="size-5" />
              </IconButton>
              <h2 className="ml-2 text-xl font-semibold tracking-tight tabular">{year}</h2>
            </div>
            {months.data && (
              <p className="text-right text-sm text-text-2">
                {t('schedule.stats', { count: totals.shifts, hours: fmt.hours(totals.minutes) })}
                {totals.vacation > 0 && <span className="block text-text-3">{t('history.vacationDays', { count: totals.vacation })}</span>}
              </p>
            )}
          </div>

          {(start.isLoading || months.isLoading) && <SkeletonCard lines={4} />}
          {months.data && (
            <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3')}>
              {months.data.map((m, i) => (
                <Stagger key={m.month} index={i}>
                  <MonthCard m={m} />
                </Stagger>
              ))}
            </div>
          )}
          {start.data && (
            <p className="mt-6 px-1 text-sm text-text-3">{t('history.since', { date: fmt.date(start.data) })}</p>
          )}
        </>
      )}
    </>
  )
}
