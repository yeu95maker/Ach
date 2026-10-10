import { CalendarCog, CalendarHeart, CalendarPlus, ChevronLeft, ChevronRight, ClipboardList, FileUp, History } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LEGEND_KINDS } from '@/components/dayKindStyles'
import { Legend } from '@/components/DayKindPill'
import { QueryError } from '@/components/QueryState'
import { fromISODate, isSameMonth } from '@/domain/dates'
import { durationMinutes, type DayAgenda } from '@/domain/schedule'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { can, canAny } from '@/domain/permissions'
import { Button, ButtonLink, Card, IconButton, PageHeader, SegmentedControl, Sheet, Skeleton, Spinner } from '@/ui'
import { DayDetail } from './DayDetail'
import { ManageSchedulesCard } from './ManageSchedulesCard'
import { MonthView } from './MonthView'
import { useAgenda, useScheduleNavigation, visibleDays, type ScheduleView } from './useSchedule'
import { WeekView } from './WeekView'

export function SchedulePage() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const employment = useEmployment()
  const nav = useScheduleNavigation()
  const days = useMemo(() => visibleDays(nav.view, nav.date), [nav.view, nav.date])
  const { agenda, isLoading, isFetching, error, refetch } = useAgenda(days)
  const [selected, setSelected] = useState<DayAgenda | null>(null)

  const title =
    nav.view === 'month'
      ? fmt.monthYear(nav.date)
      : nav.view === 'week'
        ? fmt.dateRange(days[0]!, days[6]!)
        : fmt.dateLong(nav.date)

  const stats = useMemo(() => {
    const inScope = nav.view === 'month' ? agenda.filter((d) => isSameMonth(d.date, fromISODate(nav.date))) : agenda
    const shifts = inScope.flatMap((d) => (d.absence ? [] : d.entries.filter((e) => e.kind === 'shift')))
    const stamps = inScope.flatMap((d) => d.entries.map((e) => e.updatedAt?.getTime() ?? 0))
    const updated = stamps.length ? Math.max(...stamps) : 0
    return { count: shifts.length, minutes: shifts.reduce((sum, e) => sum + durationMinutes(e), 0), updatedAt: updated ? new Date(updated) : null }
  }, [agenda, nav.view, nav.date])

  const views: { value: ScheduleView; label: string }[] = [
    { value: 'month', label: t('schedule.month') },
    { value: 'week', label: t('schedule.week') },
    { value: 'day', label: t('schedule.day') },
  ]

  return (
    <>
      <PageHeader
        title={t('schedule.title')}
        subtitle={
          <>
            {t('schedule.stats', { count: stats.count, hours: fmt.hours(stats.minutes) })}
            {stats.updatedAt && <span className="block text-sm text-text-3">{t('schedule.updatedAt', { when: fmt.relative(stats.updatedAt) })}</span>}
          </>
        }
        actions={<SegmentedControl label={t('schedule.viewLabel')} options={views} value={nav.view} onChange={nav.setView} className="w-[264px]" />}
      />

      <nav aria-label={t('schedule.more')} className="-mt-2 mb-6 flex flex-wrap gap-2">
        {can(employment, 'wishes.submit') && (
          <ButtonLink to="/schedule/wishes" variant="soft" size="sm" icon={<CalendarHeart className="size-4" />}>
            {t('wishes.title')}
          </ButtonLink>
        )}
        <ButtonLink to="/schedule/open" variant="secondary" size="sm" icon={<CalendarPlus className="size-4" />}>
          {t('openShifts.title')}
        </ButtonLink>
        <ButtonLink to="/schedule/history" variant="secondary" size="sm" icon={<History className="size-4" />}>
          {t('history.title')}
        </ButtonLink>
        {can(employment, 'schedule.manage') && (
          <ButtonLink to="/schedule/plan" variant="secondary" size="sm" icon={<CalendarCog className="size-4" />}>
            {t('editor.title')}
          </ButtonLink>
        )}
        {can(employment, 'schedule.import') && (
          <ButtonLink to="/schedule/import" variant="secondary" size="sm" icon={<FileUp className="size-4" />}>
            {t('integration.title')}
          </ButtonLink>
        )}
        {canAny(employment, ['wishes.view', 'wishes.manage']) && (
          <ButtonLink to="/schedule/wishes/manage" variant="secondary" size="sm" icon={<ClipboardList className="size-4" />}>
            {t('wishes.manageLink')}
          </ButtonLink>
        )}
      </nav>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={t('common.previous')} variant="secondary" onClick={() => nav.step(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label={t('common.next')} variant="secondary" onClick={() => nav.step(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
          <h2 className="ml-2 text-lg font-semibold tracking-tight capitalize sm:text-xl">{title}</h2>
          {isFetching && !isLoading && <Spinner className="ml-2 size-4 text-text-3" />}
        </div>
        <Button variant="soft" size="sm" onClick={nav.goToday} disabled={nav.date === nav.today && nav.view !== 'month'}>
          {t('common.today')}
        </Button>
      </div>

      {error && <QueryError error={error} onRetry={refetch} />}
      {isLoading && <Skeleton className="h-[480px] w-full rounded-[var(--radius-card)]" />}

      {!isLoading && !error && (
        <div key={`${nav.view}-${days[0]}`} className="animate-fade-in">
          {nav.view === 'month' && <MonthView agenda={agenda} anchor={nav.date} today={nav.today} onSelect={setSelected} />}
          {nav.view === 'week' && <WeekView agenda={agenda} today={nav.today} onSelect={setSelected} />}
          {nav.view === 'day' && agenda[0] && (
            <Card padding="lg">
              <DayDetail day={agenda[0]} />
            </Card>
          )}
        </div>
      )}

      <Legend kinds={LEGEND_KINDS} className="mt-5 px-1" />

      {employment.managedUnitIds.length > 0 && (
        <div className="mt-8">
          <ManageSchedulesCard from={days[0]!} to={days[days.length - 1]!} />
        </div>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} closeLabel={t('common.close')} title={selected ? fmt.dateLong(selected.date) : ''} size="lg">
        {selected && <DayDetail day={selected} />}
      </Sheet>
    </>
  )
}
