import type { Colleague, RosterEntry, TeamLeaveRequest, TeamSickLeave } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'
import { mapColleague, mapLeaveRequest, mapRoster, mapSickLeave } from './mappers'
import type { DirectoryRow, EmployeeRow, LeaveRequestRow, ShiftRosterRow, SickLeaveRow } from './rows'

const DIRECTORY_COLUMNS =
  'employee_id, hospital_id, user_id, first_name, last_name, avatar_path, job_title, primary_unit_id, primary_unit_name, languages, qualifications'

async function directoryByEmployee(hospitalId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return new Map<string, Colleague>()
  const rows = unwrapList<DirectoryRow>(
    await db().from('employee_directory').select(DIRECTORY_COLUMNS).eq('hospital_id', hospitalId).in('employee_id', employeeIds),
  )
  return new Map(rows.map((r) => [r.employee_id, mapColleague(r)]))
}

const personOf = (c: Colleague | undefined) =>
  c ? { firstName: c.firstName, lastName: c.lastName, avatarPath: c.avatarPath, jobTitle: c.jobTitle } : null

export interface EmployeeOverviewItem extends Colleague {
  email: string | null
  phone: string | null
  personnelNumber: string | null
  employmentType: string
  weeklyHours: number | null
}

export const teamRepository = {
  /** Everyone whose (published) shift is running at `at`. */
  async fetchOnDuty(hospitalId: string, at: Date): Promise<RosterEntry[]> {
    const iso = at.toISOString()
    const rows = unwrapList<ShiftRosterRow>(
      await db()
        .from('shift_roster')
        .select(
          'entry_id, hospital_id, schedule_id, schedule_status, unit_id, unit_name, employee_id, kind, entry_date, starts_at, ends_at, note, shift_type_id, shift_code, shift_name, shift_category, shift_color, first_name, last_name, avatar_path, job_title, qualifications',
        )
        .eq('hospital_id', hospitalId)
        .eq('schedule_status', 'published')
        .eq('kind', 'shift')
        .not('employee_id', 'is', null)
        .lte('starts_at', iso)
        .gt('ends_at', iso)
        .order('unit_name')
        .order('last_name'),
    )
    return rows.map(mapRoster)
  },

  async fetchDirectory(hospitalId: string): Promise<Colleague[]> {
    const rows = unwrapList<DirectoryRow>(
      await db().from('employee_directory').select(DIRECTORY_COLUMNS).eq('hospital_id', hospitalId).order('last_name').order('first_name'),
    )
    return rows.map(mapColleague)
  },

  /** Employee overview for managers: only rows within the caller's scope are returned by RLS. */
  async fetchEmployeeOverview(hospitalId: string): Promise<EmployeeOverviewItem[]> {
    const employees = unwrapList<EmployeeRow>(
      await db()
        .from('employees')
        .select('id, user_id, personnel_number, employment_type, weekly_hours, status')
        .eq('hospital_id', hospitalId)
        .eq('status', 'active'),
    )
    const ids = employees.map((e) => e.id)
    const [directory, users] = await Promise.all([
      directoryByEmployee(hospitalId, ids),
      ids.length
        ? db().from('users').select('id, email, phone').in('id', employees.map((e) => e.user_id))
        : Promise.resolve({ data: [], error: null }),
    ])
    const contact = new Map(unwrapList<{ id: string; email: string; phone: string | null }>(users).map((u) => [u.id, u]))

    return employees
      .map((e) => {
        const person = directory.get(e.id)
        if (!person) return null
        return {
          ...person,
          email: contact.get(e.user_id)?.email ?? null,
          phone: contact.get(e.user_id)?.phone ?? null,
          personnelNumber: e.personnel_number,
          employmentType: e.employment_type,
          weeklyHours: e.weekly_hours,
        }
      })
      .filter((e): e is EmployeeOverviewItem => e !== null)
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  },

  async fetchTeamLeaveRequests(hospitalId: string, ownEmployeeId: string): Promise<TeamLeaveRequest[]> {
    const rows = unwrapList<LeaveRequestRow>(
      await db()
        .from('leave_requests')
        .select('id, hospital_id, employee_id, leave_type, start_date, end_date, comment, status, decision_note, decided_at, created_at')
        .eq('hospital_id', hospitalId)
        .neq('employee_id', ownEmployeeId)
        .in('status', ['pending', 'approved', 'rejected'])
        .order('status')
        .order('start_date')
        .limit(200),
    )
    const people = await directoryByEmployee(hospitalId, [...new Set(rows.map((r) => r.employee_id))])
    return rows.map((r) => ({ ...mapLeaveRequest(r), person: personOf(people.get(r.employee_id)) }))
  },

  async decideLeaveRequest(id: string, approve: boolean, note: string | null) {
    unwrap(await db().rpc('decide_leave_request', { p_request_id: id, p_approve: approve, p_note: note }))
  },

  async fetchTeamSickLeaves(hospitalId: string, ownEmployeeId: string): Promise<TeamSickLeave[]> {
    const rows = unwrapList<SickLeaveRow>(
      await db()
        .from('sick_leaves')
        .select('id, hospital_id, employee_id, start_date, end_date, status, acknowledged_at, created_at')
        .eq('hospital_id', hospitalId)
        .neq('employee_id', ownEmployeeId)
        .in('status', ['reported', 'acknowledged'])
        .order('start_date', { ascending: false })
        .limit(200),
    )
    const people = await directoryByEmployee(hospitalId, [...new Set(rows.map((r) => r.employee_id))])
    return rows.map((r) => ({ ...mapSickLeave(r), person: personOf(people.get(r.employee_id)) }))
  },

  async acknowledgeSickLeave(id: string) {
    unwrap(await db().rpc('acknowledge_sick_leave', { p_sick_leave_id: id }))
  },

  async fetchSickLeaveComment(id: string): Promise<string | null> {
    return unwrap<string | null>(await db().rpc('get_sick_leave_comment', { p_sick_leave_id: id }))
  },
}
