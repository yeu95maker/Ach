import { describe, expect, it } from 'vitest'
import { cellChange, cellIssues, dailyCounts, requiredOn, restViolations } from './rosterPlanning'
import type { RosterEntry, ShiftCategory } from './types'

function shift(id: string, employeeId: string | null, date: string, start: string, end: string, category: ShiftCategory): RosterEntry {
  return {
    id, scheduleId: 's', scheduleStatus: 'draft', unitId: 'u', unitName: '3A', employeeId, kind: 'shift', date,
    startsAt: new Date(start), endsAt: new Date(end), note: null,
    shiftType: { id: category, code: category[0]!.toUpperCase(), name: category, category, color: null }, person: null,
  }
}

describe('rest periods', () => {
  it('flags a shift that starts less than 11 h after the previous one', () => {
    const late = shift('a', 'e1', '2026-11-02', '2026-11-02T12:45:00Z', '2026-11-02T21:00:00Z', 'late')
    const early = shift('b', 'e1', '2026-11-03', '2026-11-03T05:00:00Z', '2026-11-03T13:15:00Z', 'early')
    const ok = shift('c', 'e1', '2026-11-05', '2026-11-05T05:00:00Z', '2026-11-05T13:15:00Z', 'early')
    expect([...restViolations([late, early, ok])]).toEqual(['b'])
  })
})

describe('cell issues', () => {
  const n = shift('x', 'e1', '2026-11-12', '2026-11-12T20:45:00Z', '2026-11-13T05:15:00Z', 'night')
  it('warns about shifts during absences and against wishes', () => {
    expect(cellIssues({ entry: n, wish: { type: 'free', shiftTypeId: null }, absences: [{ id: 'l', kind: 'vacation', startDate: '2026-11-10', endDate: '2026-11-14' }], date: '2026-11-12', restViolation: false }))
      .toEqual(['absence_vacation', 'wish_conflict'])
    expect(cellIssues({ entry: n, wish: { type: 'night', shiftTypeId: null }, absences: [], date: '2026-11-12', restViolation: true })).toEqual(['rest_period'])
    expect(cellIssues({ entry: null, wish: { type: 'free', shiftTypeId: null }, absences: [], date: '2026-11-12', restViolation: false })).toEqual([])
  })
})

describe('staffing', () => {
  it('counts staffed shifts per day and category, ignoring open shifts', () => {
    const counts = dailyCounts(
      [shift('1', 'e1', '2026-11-02', '2026-11-02T05:00:00Z', '2026-11-02T13:00:00Z', 'early'), shift('2', null, '2026-11-02', '2026-11-02T05:00:00Z', '2026-11-02T13:00:00Z', 'early')],
      ['2026-11-02'],
    )
    expect(counts.get('2026-11-02')!.early).toBe(1)
  })
  it('sums requirements for the weekday', () => {
    const reqs = [
      { shiftTypeId: 'F', category: 'early' as const, weekday: null, minStaff: 3 },
      { shiftTypeId: 'N', category: 'night' as const, weekday: 1, minStaff: 2 },
    ]
    expect(requiredOn(reqs, '2026-11-02')).toEqual({ early: 3, night: 2 }) // Monday
    expect(requiredOn(reqs, '2026-11-03')).toEqual({ early: 3 })
  })
})

describe('cellChange (tap with brush)', () => {
  const f = { kind: 'shift' as const, shiftType: { id: 'F', code: 'F', name: 'F', category: 'early' as const, color: null } }
  it('sets, toggles off and erases', () => {
    expect(cellChange(null, { kind: 'shift', shiftTypeId: 'F' })).toEqual({ kind: 'shift', shiftTypeId: 'F' })
    expect(cellChange(f, { kind: 'shift', shiftTypeId: 'F' })).toEqual({ kind: null })
    expect(cellChange(f, { kind: 'shift', shiftTypeId: 'S' })).toEqual({ kind: 'shift', shiftTypeId: 'S' })
    expect(cellChange(f, { kind: 'off' })).toEqual({ kind: 'off' })
    expect(cellChange(null, { kind: 'erase' })).toBeNull()
    expect(cellChange(f, { kind: 'inspect' })).toBeNull()
  })
})
