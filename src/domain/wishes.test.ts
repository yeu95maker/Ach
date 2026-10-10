import { describe, expect, it } from 'vitest'
import { applyWish, compareWithPlan, countByType, daysUntil, wishPlanEditability, wishesEqual, type Wish } from './wishes'

const period = { status: 'open' as const, deadlineAt: new Date('2026-10-17T21:59:00Z'), allowEditAfterSubmit: true }
const now = new Date('2026-10-10T08:00:00Z')

describe('wishPlanEditability', () => {
  it('is editable while open and before the deadline', () => {
    expect(wishPlanEditability(period, null, now)).toEqual({ editable: true })
    expect(wishPlanEditability(period, { id: 's' }, now)).toEqual({ editable: true })
  })
  it('blocks after the deadline, when locked, or when changes are not allowed', () => {
    expect(wishPlanEditability(period, null, new Date('2026-10-18T00:00:00Z'))).toEqual({ editable: false, reason: 'deadline_passed' })
    expect(wishPlanEditability({ ...period, status: 'locked' }, null, now)).toEqual({ editable: false, reason: 'not_open' })
    expect(wishPlanEditability({ ...period, allowEditAfterSubmit: false }, { id: 's' }, now)).toEqual({ editable: false, reason: 'already_submitted' })
  })
})

describe('applyWish (tap to paint)', () => {
  it('sets, replaces and removes with the same tap gesture', () => {
    let m = applyWish(new Map(), '2026-11-12', 'free')
    expect(m.get('2026-11-12')?.type).toBe('free')
    m = applyWish(m, '2026-11-12', 'night')
    expect(m.get('2026-11-12')?.type).toBe('night')
    m = applyWish(m, '2026-11-12', 'night')
    expect(m.has('2026-11-12')).toBe(false)
  })
  it('keeps the note when the type changes and erases on demand', () => {
    let m = applyWish(new Map(), '2026-11-13', 'free')
    m.set('2026-11-13', { ...m.get('2026-11-13')!, note: 'Hochzeit' })
    m = applyWish(m, '2026-11-13', 'unavailable')
    expect(m.get('2026-11-13')?.note).toBe('Hochzeit')
    expect(applyWish(m, '2026-11-13', 'erase').size).toBe(0)
  })
  it('distinguishes preferred shifts by shift type', () => {
    let m = applyWish(new Map(), '2026-11-14', 'preferred', 'F')
    m = applyWish(m, '2026-11-14', 'preferred', 'S')
    expect(m.get('2026-11-14')?.shiftTypeId).toBe('S')
  })
})

describe('compareWithPlan', () => {
  const shift = (category: 'early' | 'late' | 'night', id: string = category) => ({ kind: 'shift' as const, category, shiftTypeId: id })
  const off = { kind: 'off' as const, category: null, shiftTypeId: null }
  it('never treats a wish as fulfilled unless the plan matches', () => {
    expect(compareWithPlan({ type: 'free', shiftTypeId: null }, null)).toBe('open')
    expect(compareWithPlan({ type: 'free', shiftTypeId: null }, off)).toBe('match')
    expect(compareWithPlan({ type: 'unavailable', shiftTypeId: null }, shift('early'))).toBe('mismatch')
    expect(compareWithPlan({ type: 'night', shiftTypeId: null }, shift('night'))).toBe('match')
    expect(compareWithPlan({ type: 'night', shiftTypeId: null }, shift('early'))).toBe('mismatch')
    expect(compareWithPlan({ type: 'late', shiftTypeId: null }, off)).toBe('mismatch')
    expect(compareWithPlan({ type: 'preferred', shiftTypeId: 'x' }, shift('late', 'x'))).toBe('match')
    expect(compareWithPlan({ type: 'preferred', shiftTypeId: 'x' }, shift('late', 'y'))).toBe('mismatch')
  })
})

describe('helpers', () => {
  it('compares wish sets independent of order and whitespace', () => {
    const a: Wish[] = [{ date: '2026-11-01', type: 'free', shiftTypeId: null, note: 'x ' }]
    const b: Wish[] = [{ date: '2026-11-01', type: 'free', shiftTypeId: null, note: 'x' }]
    expect(wishesEqual(a, b)).toBe(true)
    expect(wishesEqual(a, [])).toBe(false)
  })
  it('counts wishes and days until the deadline', () => {
    expect(countByType([{ type: 'free' }, { type: 'free' }, { type: 'night' }]).free).toBe(2)
    expect(daysUntil(new Date('2026-10-17T08:00:00Z'), now)).toBe(7)
    expect(daysUntil(new Date('2026-10-01T08:00:00Z'), now)).toBe(0)
  })
})
