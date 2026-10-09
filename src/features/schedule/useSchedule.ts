import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { scheduleRepository } from '@/data/scheduleRepository'
import { addDaysISO, fromISODate, isoDateInTimeZone, monthGrid, weekDays } from '@/domain/dates'
import { buildAgenda } from '@/domain/schedule'
import type { ISODate, RosterEntry } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'

export type ScheduleView = 'month' | 'week' | 'day'

const isView = (v: string | null): v is ScheduleView => v === 'month' || v === 'week' || v === 'day'
const isISODate = (v: string | null): v is ISODate => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** View + anchor date live in the URL so every state is deep-linkable. */
export function useScheduleNavigation() {
  const employment = useEmployment()
  const [params, setParams] = useSearchParams()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)
  const view: ScheduleView = isView(params.get('view')) ? (params.get('view') as ScheduleView) : 'month'
  const date: ISODate = isISODate(params.get('date')) ? params.get('date')! : today

  const update = (next: Partial<{ view: ScheduleView; date: ISODate }>) => {
    const p = new URLSearchParams(params)
    if (next.view) p.set('view', next.view)
    if (next.date) p.set('date', next.date)
    setParams(p, { replace: true })
  }

  const step = (direction: -1 | 1) => {
    if (view === 'day') return update({ date: addDaysISO(date, direction) })
    if (view === 'week') return update({ date: addDaysISO(date, 7 * direction) })
    const d = fromISODate(date)
    const target = new Date(d.getFullYear(), d.getMonth() + direction, 1)
    update({ date: `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01` })
  }

  return { view, date, today, setView: (v: ScheduleView) => update({ view: v }), setDate: (d: ISODate) => update({ date: d }), step, goToday: () => update({ date: today }) }
}

export function visibleDays(view: ScheduleView, date: ISODate): ISODate[] {
  if (view === 'day') return [date]
  if (view === 'week') return weekDays(fromISODate(date))
  return monthGrid(fromISODate(date))
}

export function useAgenda(days: ISODate[]) {
  const employment = useEmployment()
  const from = days[0]!
  const to = days[days.length - 1]!
  const roster = useQuery({
    queryKey: queryKeys.roster(employment.employeeId, from, to),
    queryFn: () => scheduleRepository.fetchMyRoster(employment.employeeId, from, to),
    placeholderData: (prev) => prev,
  })
  const absences = useQuery({
    queryKey: queryKeys.absences(employment.employeeId, from, to),
    queryFn: () => scheduleRepository.fetchMyAbsences(employment.employeeId, from, to),
    placeholderData: (prev) => prev,
  })
  const agenda = useMemo(() => buildAgenda(days, roster.data ?? [], absences.data ?? []), [days, roster.data, absences.data])
  return {
    agenda,
    isLoading: roster.isLoading || absences.isLoading,
    isFetching: roster.isFetching || absences.isFetching,
    error: roster.error ?? absences.error,
    refetch: () => {
      void roster.refetch()
      void absences.refetch()
    },
  }
}

export function useShiftColleagues(entry: RosterEntry | null) {
  return useQuery({
    queryKey: queryKeys.shiftColleagues(entry?.id ?? ''),
    queryFn: () => scheduleRepository.fetchShiftColleagues(entry!),
    enabled: !!entry && entry.kind === 'shift',
  })
}
