/**
 * Dienstplan-Editor – planning rules (pure, framework-free).
 * The editor only WARNS; decisions stay with the scheduler. Hard rules
 * (double booking) are enforced by the database.
 */
import { isWithin } from './dates'
import type { Absence, ISODate, RosterEntry, ShiftCategory } from './types'
import { compareWithPlan, type Wish } from './wishes'

/** Minimum rest between two shifts (ArbZG § 5: 11 h; hospitals may shorten to 10 h). */
export const MIN_REST_HOURS = 11

export type PlanningIssue = 'absence_vacation' | 'absence_sick' | 'rest_period' | 'wish_conflict'

/** Entry ids that start less than `minHours` after the previous shift of the same person ended. */
export function restViolations(entries: readonly RosterEntry[], minHours = MIN_REST_HOURS): Set<string> {
  const byEmployee = new Map<string, RosterEntry[]>()
  for (const e of entries) {
    if (e.kind !== 'shift' || !e.employeeId || !e.startsAt || !e.endsAt) continue
    byEmployee.set(e.employeeId, [...(byEmployee.get(e.employeeId) ?? []), e])
  }
  const result = new Set<string>()
  for (const list of byEmployee.values()) {
    list.sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!
      const cur = list[i]!
      const restHours = (cur.startsAt!.getTime() - prev.endsAt!.getTime()) / 3_600_000
      if (restHours < minHours) result.add(cur.id)
    }
  }
  return result
}

/** Everything the editor wants to point out for one cell. */
export function cellIssues(input: {
  entry: RosterEntry | null
  wish: Pick<Wish, 'type' | 'shiftTypeId'> | null
  absences: readonly Absence[]
  date: ISODate
  restViolation: boolean
}): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  const { entry, wish, absences, date } = input
  const isShift = entry?.kind === 'shift'
  if (isShift) {
    const absence = absences.find((a) => isWithin(date, a.startDate, a.endDate))
    if (absence) issues.push(absence.kind === 'sick' ? 'absence_sick' : 'absence_vacation')
  }
  if (input.restViolation) issues.push('rest_period')
  if (wish && entry) {
    const match = compareWithPlan(wish, { kind: entry.kind, category: entry.shiftType?.category ?? null, shiftTypeId: entry.shiftType?.id ?? null })
    if (match === 'mismatch') issues.push('wish_conflict')
  }
  return issues
}

export type DailyCounts = Record<ShiftCategory, number>

const emptyCounts = (): DailyCounts => ({ early: 0, late: 0, night: 0, day: 0, other: 0 })

/** Planned shifts per day and category (open shifts excluded – they are not staffed). */
export function dailyCounts(entries: readonly RosterEntry[], days: readonly ISODate[]): Map<ISODate, DailyCounts> {
  const map = new Map<ISODate, DailyCounts>(days.map((d) => [d, emptyCounts()]))
  for (const e of entries) {
    if (e.kind !== 'shift' || !e.employeeId) continue
    const c = map.get(e.date)
    if (c) c[e.shiftType?.category ?? 'other']++
  }
  return map
}

export interface StaffingRequirement {
  shiftTypeId: string
  category: ShiftCategory
  weekday: number | null // ISO 1–7, null = every day
  minStaff: number
}

/** Minimum staff per category for a date (sum over matching requirements). */
export function requiredOn(reqs: readonly StaffingRequirement[], date: ISODate): Partial<Record<ShiftCategory, number>> {
  const jsDay = new Date(`${date}T12:00:00`).getDay()
  const isoDay = jsDay === 0 ? 7 : jsDay
  const out: Partial<Record<ShiftCategory, number>> = {}
  for (const r of reqs) {
    if (r.weekday !== null && r.weekday !== isoDay) continue
    out[r.category] = (out[r.category] ?? 0) + r.minStaff
  }
  return out
}

export type Brush = { kind: 'shift'; shiftTypeId: string } | { kind: 'off' } | { kind: 'erase' } | { kind: 'inspect' }

/**
 * What a tap with the brush does to a cell:
 * same value → clear · otherwise set. Returns null for "no change" (inspect).
 */
export function cellChange(
  current: Pick<RosterEntry, 'kind' | 'shiftType'> | null,
  brush: Brush,
): { kind: 'shift'; shiftTypeId: string } | { kind: 'off' } | { kind: null } | null {
  if (brush.kind === 'inspect') return null
  if (brush.kind === 'erase') return current ? { kind: null } : null
  if (brush.kind === 'off') return current?.kind === 'off' ? { kind: null } : { kind: 'off' }
  if (current?.kind === 'shift' && current.shiftType?.id === brush.shiftTypeId) return { kind: null }
  return { kind: 'shift', shiftTypeId: brush.shiftTypeId }
}
