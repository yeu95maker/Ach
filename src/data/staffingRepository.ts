import type { ShiftCategory } from '@/domain/types'
import type { CoverShift, ShiftCandidate } from '@/domain/staffing'
import { db, unwrap, unwrapList } from './client'

interface CoverShiftRow {
  entry_id: string
  schedule_id: string
  unit_id: string
  unit_name: string
  entry_date: string
  starts_at: string
  ends_at: string
  shift_code: string | null
  shift_name: string | null
  shift_category: ShiftCategory | null
}

interface CandidateRow {
  employee_id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  job_title: string
  available: boolean
  absence: 'vacation' | 'sick' | null
  busy_shift_code: string | null
  planned_off: boolean
  rest_ok: boolean
  rest_before_hours: number | string | null
  rest_after_hours: number | string | null
  wish_type: string | null
  interested: boolean
  month_shift_count: number
  month_minutes: number
}

export type InterestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export interface OpenShiftInterest {
  id: string
  entryId: string
  employeeId: string
  note: string | null
  status: InterestStatus
  createdAt: Date
}

const num = (v: number | string | null) => (v === null ? null : Number(v))

const mapShift = (r: CoverShiftRow): CoverShift => ({
  entryId: r.entry_id,
  scheduleId: r.schedule_id,
  unitId: r.unit_id,
  unitName: r.unit_name,
  date: r.entry_date,
  startsAt: new Date(r.starts_at),
  endsAt: new Date(r.ends_at),
  shiftCode: r.shift_code,
  shiftName: r.shift_name,
  category: r.shift_category,
})

export const staffingRepository = {
  /** Upcoming shifts of a sick colleague on wards the caller manages. */
  async fetchSickLeaveShifts(sickLeaveId: string): Promise<CoverShift[]> {
    return unwrapList<CoverShiftRow>(await db().rpc('get_sick_leave_shifts', { p_sick_leave_id: sickLeaveId })).map(mapShift)
  },

  /** Every active ward member with availability, rest time, wishes and workload. */
  async fetchCandidates(entryId: string): Promise<ShiftCandidate[]> {
    const rows = unwrapList<CandidateRow>(await db().rpc('get_shift_candidates', { p_entry_id: entryId }))
    return rows.map((r) => ({
      employeeId: r.employee_id,
      firstName: r.first_name,
      lastName: r.last_name,
      avatarPath: r.avatar_path,
      jobTitle: r.job_title,
      available: r.available,
      absence: r.absence,
      busyShiftCode: r.busy_shift_code,
      plannedOff: r.planned_off,
      restOk: r.rest_ok,
      restBeforeHours: num(r.rest_before_hours),
      restAfterHours: num(r.rest_after_hours),
      wishType: r.wish_type,
      interested: r.interested,
      monthShiftCount: r.month_shift_count,
      monthMinutes: r.month_minutes,
    }))
  },

  async assignShift(entryId: string, employeeId: string): Promise<void> {
    unwrap(await db().rpc('assign_shift', { p_entry_id: entryId, p_employee_id: employeeId }))
  },

  async releaseShift(entryId: string): Promise<void> {
    unwrap(await db().rpc('release_shift', { p_entry_id: entryId }))
  },

  /** Published open shifts of the given wards that have not started yet. */
  async fetchOpenShifts(hospitalId: string, unitIds: string[]): Promise<CoverShift[]> {
    if (!unitIds.length) return []
    const rows = unwrapList<CoverShiftRow>(
      await db()
        .from('shift_roster')
        .select('entry_id, schedule_id, unit_id, unit_name, entry_date, starts_at, ends_at, shift_code, shift_name, shift_category')
        .eq('hospital_id', hospitalId)
        .eq('schedule_status', 'published')
        .eq('kind', 'shift')
        .is('employee_id', null)
        .in('unit_id', unitIds)
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(100),
    )
    return rows.map(mapShift)
  },

  /** Own interests, or all interests for managed wards (RLS). */
  async fetchInterests(entryIds: string[]): Promise<OpenShiftInterest[]> {
    if (!entryIds.length) return []
    const rows = unwrapList<{ id: string; entry_id: string; employee_id: string; note: string | null; status: InterestStatus; created_at: string }>(
      await db().from('open_shift_interests').select('id, entry_id, employee_id, note, status, created_at').in('entry_id', entryIds),
    )
    return rows.map((r) => ({ id: r.id, entryId: r.entry_id, employeeId: r.employee_id, note: r.note, status: r.status, createdAt: new Date(r.created_at) }))
  },

  async expressInterest(entryId: string, note: string | null): Promise<void> {
    unwrap(await db().rpc('express_open_shift_interest', { p_entry_id: entryId, p_note: note }))
  },

  async withdrawInterest(entryId: string): Promise<void> {
    unwrap(await db().rpc('withdraw_open_shift_interest', { p_entry_id: entryId }))
  },
}
