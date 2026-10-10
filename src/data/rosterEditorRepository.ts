import type { StaffingRequirement } from '@/domain/rosterPlanning'
import type { Absence, ISODate, RosterEntry, ScheduleSummary, ShiftCategory } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'
import { mapRoster } from './mappers'
import type { ShiftRosterRow } from './rows'

const ROSTER_COLUMNS =
  'entry_id, hospital_id, schedule_id, schedule_status, unit_id, unit_name, employee_id, kind, entry_date, starts_at, ends_at, note, shift_type_id, shift_code, shift_name, shift_category, shift_color, first_name, last_name, avatar_path, job_title, qualifications'

export interface EditorShiftType {
  id: string
  code: string
  name: string
  category: ShiftCategory
  unitId: string | null
}

export const rosterEditorRepository = {
  /** The (non-archived) roster of a ward that covers the given month, if any. */
  async fetchSchedule(unitId: string, from: ISODate, to: ISODate): Promise<ScheduleSummary | null> {
    const rows = unwrapList<{ id: string; unit_id: string; period_start: string; period_end: string; status: ScheduleSummary['status']; version: number; published_at: string | null; units: { name: string } | null }>(
      await db()
        .from('schedules')
        .select('id, unit_id, period_start, period_end, status, version, published_at, units(name)')
        .eq('unit_id', unitId)
        .neq('status', 'archived')
        .lte('period_start', to)
        .gte('period_end', from)
        .order('period_start')
        .limit(1),
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id,
      unitId: r.unit_id,
      unitName: r.units?.name ?? '',
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      version: r.version,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    }
  },

  async createSchedule(hospitalId: string, unitId: string, from: ISODate, to: ISODate): Promise<string> {
    const rows = unwrapList<{ id: string }>(
      await db().from('schedules').insert({ hospital_id: hospitalId, unit_id: unitId, period_start: from, period_end: to }).select('id'),
    )
    return rows[0]!.id
  },

  /** All entries of the roster (drafts included – RLS: schedule.view_drafts). */
  async fetchEntries(scheduleId: string): Promise<RosterEntry[]> {
    return unwrapList<ShiftRosterRow>(await db().from('shift_roster').select(ROSTER_COLUMNS).eq('schedule_id', scheduleId)).map(mapRoster)
  },

  async fetchShiftTypes(hospitalId: string, unitId: string): Promise<EditorShiftType[]> {
    const rows = unwrapList<{ id: string; code: string; name: string; category: ShiftCategory; unit_id: string | null }>(
      await db().from('shift_types').select('id, code, name, category, unit_id').eq('hospital_id', hospitalId).eq('is_active', true).order('sort_order'),
    )
    return rows.filter((r) => r.unit_id === null || r.unit_id === unitId).map((r) => ({ id: r.id, code: r.code, name: r.name, category: r.category, unitId: r.unit_id }))
  },

  async fetchStaffing(unitId: string, shiftTypes: EditorShiftType[]): Promise<StaffingRequirement[]> {
    const rows = unwrapList<{ shift_type_id: string; weekday: number | null; min_staff: number }>(
      await db().from('staffing_requirements').select('shift_type_id, weekday, min_staff').eq('unit_id', unitId),
    )
    const byId = new Map(shiftTypes.map((s) => [s.id, s]))
    return rows
      .filter((r) => byId.has(r.shift_type_id))
      .map((r) => ({ shiftTypeId: r.shift_type_id, category: byId.get(r.shift_type_id)!.category, weekday: r.weekday, minStaff: r.min_staff }))
  },

  /** Approved leave and sick leave of the ward's employees (RLS: leave.view / sick_leave.view). */
  async fetchAbsences(employeeIds: string[], from: ISODate, to: ISODate): Promise<Map<string, Absence[]>> {
    const map = new Map<string, Absence[]>()
    if (!employeeIds.length) return map
    const [leave, sick] = await Promise.all([
      db().from('leave_requests').select('id, employee_id, leave_type, start_date, end_date').in('employee_id', employeeIds).eq('status', 'approved').lte('start_date', to).gte('end_date', from),
      db().from('sick_leaves').select('id, employee_id, start_date, end_date').in('employee_id', employeeIds).in('status', ['reported', 'acknowledged']).lte('start_date', to).gte('end_date', from),
    ])
    const add = (employeeId: string, a: Absence) => map.set(employeeId, [...(map.get(employeeId) ?? []), a])
    for (const r of unwrapList<{ id: string; employee_id: string; leave_type: Absence['leaveType']; start_date: string; end_date: string }>(leave))
      add(r.employee_id, { id: r.id, kind: 'vacation', startDate: r.start_date, endDate: r.end_date, leaveType: r.leave_type })
    for (const r of unwrapList<{ id: string; employee_id: string; start_date: string; end_date: string }>(sick))
      add(r.employee_id, { id: r.id, kind: 'sick', startDate: r.start_date, endDate: r.end_date })
    return map
  },

  /** Set one cell (kind null = clear). Overlaps are rejected by the database. */
  async setCell(scheduleId: string, employeeId: string, date: ISODate, kind: 'shift' | 'off' | null, shiftTypeId: string | null): Promise<void> {
    unwrap(
      await db().rpc('set_schedule_cell', {
        p_schedule_id: scheduleId,
        p_employee_id: employeeId,
        p_date: date,
        p_kind: kind,
        p_shift_type_id: shiftTypeId,
      }),
    )
  },

  async addOpenShift(hospitalId: string, scheduleId: string, date: ISODate, shiftTypeId: string): Promise<void> {
    unwrap(await db().from('schedule_entries').insert({ hospital_id: hospitalId, schedule_id: scheduleId, employee_id: null, kind: 'shift', shift_type_id: shiftTypeId, entry_date: date }))
  },

  async deleteEntry(entryId: string): Promise<void> {
    unwrap(await db().from('schedule_entries').delete().eq('id', entryId))
  },
}
