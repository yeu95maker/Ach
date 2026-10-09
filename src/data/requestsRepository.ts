import type { ISODate, LeaveRequest, LeaveType, SickLeave } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'
import { mapLeaveRequest, mapSickLeave } from './mappers'
import type { LeaveRequestRow, SickLeaveRow } from './rows'

export interface NewLeaveRequest {
  employeeId: string
  leaveType: LeaveType
  startDate: ISODate
  endDate: ISODate
  comment: string | null
}

export interface NewSickLeave {
  employeeId: string
  startDate: ISODate
  endDate: ISODate
  comment: string | null
}

export const requestsRepository = {
  async fetchMyLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
    const rows = unwrapList<LeaveRequestRow>(
      await db()
        .from('leave_requests')
        .select('id, hospital_id, employee_id, leave_type, start_date, end_date, comment, status, decision_note, decided_at, created_at')
        .eq('employee_id', employeeId)
        .order('start_date', { ascending: false })
        .limit(100),
    )
    return rows.map(mapLeaveRequest)
  },

  async createLeaveRequest(input: NewLeaveRequest): Promise<void> {
    // hospital_id and status are derived server-side (trigger + column grants).
    unwrap(
      await db().from('leave_requests').insert({
        employee_id: input.employeeId,
        leave_type: input.leaveType,
        start_date: input.startDate,
        end_date: input.endDate,
        comment: input.comment,
      }),
    )
  },

  async cancelLeaveRequest(id: string): Promise<void> {
    unwrap(await db().rpc('cancel_leave_request', { p_request_id: id }))
  },

  async fetchMySickLeaves(employeeId: string): Promise<SickLeave[]> {
    const rows = unwrapList<SickLeaveRow>(
      await db()
        .from('sick_leaves')
        .select('id, hospital_id, employee_id, start_date, end_date, status, acknowledged_at, created_at')
        .eq('employee_id', employeeId)
        .order('start_date', { ascending: false })
        .limit(50),
    )
    return rows.map(mapSickLeave)
  },

  /** Comment is encrypted server-side (pgcrypto + Vault). */
  async reportSickLeave(input: NewSickLeave): Promise<string> {
    return unwrap<string>(
      await db().rpc('report_sick_leave', {
        p_employee_id: input.employeeId,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_comment: input.comment,
      }),
    )
  },
}
