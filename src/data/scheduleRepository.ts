import type { Absence, ISODate, RosterEntry, ScheduleSummary } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'
import { mapRoster } from './mappers'
import type { ScheduleRow, ShiftRosterRow } from './rows'

const ROSTER_COLUMNS =
  'entry_id, hospital_id, schedule_id, schedule_status, unit_id, unit_name, employee_id, kind, entry_date, starts_at, ends_at, note, shift_type_id, shift_code, shift_name, shift_category, shift_color, first_name, last_name, avatar_path, job_title, qualifications'

export const scheduleRepository = {
  /** Own roster entries in a date range (published rosters and the archived history). */
  async fetchMyRoster(employeeId: string, from: ISODate, to: ISODate): Promise<RosterEntry[]> {
    const rows = unwrapList<ShiftRosterRow>(
      await db()
        .from('shift_roster')
        .select(ROSTER_COLUMNS)
        .eq('employee_id', employeeId)
        .in('schedule_status', ['published', 'archived'])
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('starts_at', { ascending: true, nullsFirst: true }),
    )
    return rows.map(mapRoster)
  },

  /** Approved leave + active sick leave overlapping the range. */
  async fetchMyAbsences(employeeId: string, from: ISODate, to: ISODate): Promise<Absence[]> {
    const [leave, sick] = await Promise.all([
      db()
        .from('leave_requests')
        .select('id, leave_type, start_date, end_date')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')
        .lte('start_date', to)
        .gte('end_date', from),
      db()
        .from('sick_leaves')
        .select('id, start_date, end_date')
        .eq('employee_id', employeeId)
        .in('status', ['reported', 'acknowledged'])
        .lte('start_date', to)
        .gte('end_date', from),
    ])
    const leaveRows = unwrapList<{ id: string; leave_type: Absence['leaveType']; start_date: string; end_date: string }>(leave)
    const sickRows = unwrapList<{ id: string; start_date: string; end_date: string }>(sick)
    return [
      ...leaveRows.map<Absence>((r) => ({ id: r.id, kind: 'vacation', startDate: r.start_date, endDate: r.end_date, leaveType: r.leave_type })),
      ...sickRows.map<Absence>((r) => ({ id: r.id, kind: 'sick', startDate: r.start_date, endDate: r.end_date })),
    ]
  },

  /** Colleagues whose shifts overlap the given shift on the same ward. */
  async fetchShiftColleagues(entry: RosterEntry): Promise<RosterEntry[]> {
    if (!entry.startsAt || !entry.endsAt) return []
    const rows = unwrapList<ShiftRosterRow>(
      await db()
        .from('shift_roster')
        .select(ROSTER_COLUMNS)
        .eq('unit_id', entry.unitId)
        .eq('kind', 'shift')
        .not('employee_id', 'is', null)
        .neq('employee_id', entry.employeeId ?? '00000000-0000-0000-0000-000000000000')
        .lt('starts_at', entry.endsAt.toISOString())
        .gt('ends_at', entry.startsAt.toISOString())
        .order('starts_at'),
    )
    return rows.map(mapRoster)
  },

  /** Rosters of wards the user manages (drafts included). */
  async fetchManagedSchedules(unitIds: string[], from: ISODate, to: ISODate): Promise<ScheduleSummary[]> {
    if (unitIds.length === 0) return []
    const rows = unwrapList<ScheduleRow>(
      await db()
        .from('schedules')
        .select('id, unit_id, period_start, period_end, status, version, published_at, units(name)')
        .in('unit_id', unitIds)
        .neq('status', 'archived')
        .lte('period_start', to)
        .gte('period_end', from)
        .order('period_start'),
    )
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      unitName: r.units?.name ?? '',
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      version: r.version,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    }))
  },

  async publishSchedule(scheduleId: string): Promise<void> {
    unwrap(await db().rpc('publish_schedule', { p_schedule_id: scheduleId }))
  },
}
