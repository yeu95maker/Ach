import type { ISODate, ShiftCategory } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'

export interface MonthHistory {
  month: ISODate
  shiftCount: number
  shiftMinutes: number
  byCategory: Partial<Record<ShiftCategory, number>>
  vacationDays: number
  sickDays: number
}

interface MonthHistoryRow {
  month: string
  shift_count: number
  shift_minutes: number
  by_category: Partial<Record<ShiftCategory, number>>
  vacation_days: number
  sick_days: number
}

export const historyRepository = {
  /** Monthly summary of the own shifts (published and archived rosters), newest first. */
  async fetchMonths(employeeId: string, from: ISODate, to: ISODate): Promise<MonthHistory[]> {
    const rows = unwrapList<MonthHistoryRow>(await db().rpc('get_my_shift_history', { p_employee_id: employeeId, p_from: from, p_to: to }))
    return rows.map((r) => ({
      month: r.month.slice(0, 10),
      shiftCount: r.shift_count,
      shiftMinutes: r.shift_minutes,
      byCategory: r.by_category ?? {},
      vacationDays: r.vacation_days,
      sickDays: r.sick_days,
    }))
  },

  /** First day with a shift – start of the year picker (null = no history yet). */
  async fetchStart(employeeId: string): Promise<ISODate | null> {
    const v = unwrap<string | null>(await db().rpc('get_my_history_start', { p_employee_id: employeeId }))
    return v ? v.slice(0, 10) : null
  },
}
