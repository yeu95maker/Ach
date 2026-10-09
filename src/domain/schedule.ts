import { isWithin } from './dates'
import type { Absence, DayKind, ISODate, RosterEntry, ShiftCategory } from './types'

export const SHIFT_CATEGORIES: readonly ShiftCategory[] = ['early', 'late', 'night', 'day', 'other']

/** Everything that happens on one calendar day for one person. */
export interface DayAgenda {
  date: ISODate
  entries: RosterEntry[]
  absence: Absence | null
  kind: DayKind | null
}

export function groupEntriesByDate(entries: readonly RosterEntry[]): Map<ISODate, RosterEntry[]> {
  const map = new Map<ISODate, RosterEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.date)
    if (list) list.push(entry)
    else map.set(entry.date, [entry])
  }
  for (const list of map.values()) list.sort(compareEntries)
  return map
}

export function compareEntries(a: RosterEntry, b: RosterEntry): number {
  const ta = a.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY
  const tb = b.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY
  return ta - tb
}

export function absenceOn(date: ISODate, absences: readonly Absence[]): Absence | null {
  // Sickness overrides vacation when both exist.
  return (
    absences.find((a) => a.kind === 'sick' && isWithin(date, a.startDate, a.endDate)) ??
    absences.find((a) => a.kind === 'vacation' && isWithin(date, a.startDate, a.endDate)) ??
    null
  )
}

/**
 * Colour-coding precedence for a day:
 * sick > vacation > shift category (first shift) > off.
 */
export function dayKind(entries: readonly RosterEntry[], absence: Absence | null): DayKind | null {
  if (absence) return absence.kind
  const shift = entries.find((e) => e.kind === 'shift')
  if (shift) return shift.shiftType?.category ?? 'other'
  if (entries.some((e) => e.kind === 'off')) return 'off'
  return null
}

export function buildAgenda(days: readonly ISODate[], entries: readonly RosterEntry[], absences: readonly Absence[]): DayAgenda[] {
  const byDate = groupEntriesByDate(entries)
  return days.map((date) => {
    const dayEntries = byDate.get(date) ?? []
    const absence = absenceOn(date, absences)
    return { date, entries: dayEntries, absence, kind: dayKind(dayEntries, absence) }
  })
}

export function isOnDuty(entry: Pick<RosterEntry, 'kind' | 'startsAt' | 'endsAt'>, at: Date): boolean {
  return entry.kind === 'shift' && !!entry.startsAt && !!entry.endsAt && entry.startsAt <= at && at < entry.endsAt
}

export function durationMinutes(entry: Pick<RosterEntry, 'startsAt' | 'endsAt'>): number {
  if (!entry.startsAt || !entry.endsAt) return 0
  return Math.round((entry.endsAt.getTime() - entry.startsAt.getTime()) / 60_000)
}
