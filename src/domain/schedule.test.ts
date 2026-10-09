import { describe, expect, it } from 'vitest'
import { absenceOn, buildAgenda, dayKind, durationMinutes, isOnDuty } from './schedule'
import type { Absence, RosterEntry, ShiftCategory } from './types'

function entry(date: string, category: ShiftCategory | null, start?: string, end?: string): RosterEntry {
  return {
    id: `${date}-${category}`,
    scheduleId: 's1',
    scheduleStatus: 'published',
    unitId: 'u1',
    unitName: 'Station 3A',
    employeeId: 'e1',
    kind: category ? 'shift' : 'off',
    date,
    startsAt: start ? new Date(start) : null,
    endsAt: end ? new Date(end) : null,
    note: null,
    shiftType: category ? { id: category, code: category[0]!.toUpperCase(), name: category, category, color: null } : null,
    person: null,
  }
}

const vacation: Absence = { id: 'a1', kind: 'vacation', startDate: '2026-10-05', endDate: '2026-10-09' }
const sick: Absence = { id: 'a2', kind: 'sick', startDate: '2026-10-08', endDate: '2026-10-08' }

describe('schedule', () => {
  it('prefers sickness over vacation', () => {
    expect(absenceOn('2026-10-08', [vacation, sick])?.kind).toBe('sick')
    expect(absenceOn('2026-10-07', [vacation, sick])?.kind).toBe('vacation')
    expect(absenceOn('2026-10-10', [vacation, sick])).toBeNull()
  })

  it('derives the day kind with the documented precedence', () => {
    expect(dayKind([entry('2026-10-01', 'night')], null)).toBe('night')
    expect(dayKind([entry('2026-10-01', null)], null)).toBe('off')
    expect(dayKind([entry('2026-10-01', 'early')], vacation)).toBe('vacation')
    expect(dayKind([], null)).toBeNull()
  })

  it('builds an agenda for every requested day', () => {
    const agenda = buildAgenda(
      ['2026-10-04', '2026-10-05'],
      [entry('2026-10-04', 'late', '2026-10-04T11:45:00Z', '2026-10-04T20:00:00Z')],
      [vacation],
    )
    expect(agenda.map((d) => d.kind)).toEqual(['late', 'vacation'])
    expect(agenda[0]!.entries).toHaveLength(1)
  })

  it('knows whether a shift is running', () => {
    const e = entry('2026-10-04', 'night', '2026-10-04T19:45:00Z', '2026-10-05T04:15:00Z')
    expect(isOnDuty(e, new Date('2026-10-04T23:00:00Z'))).toBe(true)
    expect(isOnDuty(e, new Date('2026-10-05T04:15:00Z'))).toBe(false)
    expect(durationMinutes(e)).toBe(510)
  })
})
