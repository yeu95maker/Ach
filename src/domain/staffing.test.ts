import { describe, expect, it } from 'vitest'
import { candidateFlags, wardShiftLevel, isRecommended, type ShiftCandidate } from './staffing'

const base: ShiftCandidate = {
  employeeId: 'e',
  firstName: 'A',
  lastName: 'B',
  avatarPath: null,
  jobTitle: '',
  available: true,
  absence: null,
  busyShiftCode: null,
  plannedOff: false,
  restOk: true,
  restBeforeHours: null,
  restAfterHours: null,
  wishType: null,
  interested: false,
  monthShiftCount: 10,
  monthMinutes: 4800,
}

describe('candidateFlags', () => {
  it('marks a free colleague as a good fit', () => {
    expect(candidateFlags({ ...base, plannedOff: true }).map((f) => f.key)).toEqual(['plannedOff', 'fits'])
    expect(isRecommended(base)).toBe(true)
  })

  it('stops at absences and other shifts', () => {
    expect(candidateFlags({ ...base, available: false, absence: 'vacation' }).map((f) => f.key)).toEqual(['vacation'])
    expect(candidateFlags({ ...base, available: false, busyShiftCode: 'F' })).toEqual([{ key: 'busy', tone: 'danger', values: { code: 'F' } }])
  })

  it('warns about short rest and wishes', () => {
    const flags = candidateFlags({ ...base, restOk: false, restBeforeHours: 8.25, restAfterHours: 30, wishType: 'free' })
    expect(flags.map((f) => f.key)).toEqual(['restShort', 'wishFree'])
    expect(flags[0]!.values).toEqual({ hours: 8.3 })
    expect(isRecommended({ ...base, wishType: 'free' })).toBe(false)
  })

  it('shows volunteers first', () => {
    expect(candidateFlags({ ...base, interested: true })[0]!.key).toBe('interested')
  })
})

describe('wardShiftLevel', () => {
  it('compares planned staff with minimum and target', () => {
    expect(wardShiftLevel({ planned: 0, minStaff: 1, targetStaff: 2 })).toBe('short')
    expect(wardShiftLevel({ planned: 1, minStaff: 1, targetStaff: 2 })).toBe('low')
    expect(wardShiftLevel({ planned: 2, minStaff: 1, targetStaff: 2 })).toBe('ok')
    expect(wardShiftLevel({ planned: 1, minStaff: 1, targetStaff: null })).toBe('ok')
    expect(wardShiftLevel({ planned: 3, minStaff: null, targetStaff: null })).toBe('none')
  })
})
