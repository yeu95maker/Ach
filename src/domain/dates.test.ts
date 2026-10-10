import { describe, expect, it } from 'vitest'
import { addDaysISO, countWorkdays, daysBetweenInclusive, isoDateInTimeZone, monthGrid, weekDays, zonedDateTime } from './dates'

describe('dates', () => {
  it('builds a full Monday-first month grid', () => {
    const grid = monthGrid(new Date(2026, 9, 15)) // October 2026
    expect(grid[0]).toBe('2026-09-28')
    expect(grid.at(-1)).toBe('2026-11-01')
    expect(grid.length % 7).toBe(0)
  })

  it('returns the 7 days of a week starting Monday', () => {
    expect(weekDays(new Date(2026, 9, 11))).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ])
  })

  it('counts workdays without weekends', () => {
    expect(countWorkdays('2026-10-05', '2026-10-11')).toBe(5)
    expect(countWorkdays('2026-10-10', '2026-10-11')).toBe(0)
    expect(countWorkdays('2026-10-11', '2026-10-05')).toBe(0)
  })

  it('counts calendar days inclusively', () => {
    expect(daysBetweenInclusive('2026-10-05', '2026-10-05')).toBe(1)
    expect(daysBetweenInclusive('2026-10-30', '2026-11-02')).toBe(4)
  })

  it('adds days across month boundaries and DST', () => {
    expect(addDaysISO('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('resolves the calendar day in the hospital time zone', () => {
    const instant = new Date('2026-10-09T23:30:00Z')
    expect(isoDateInTimeZone(instant, 'Europe/Berlin')).toBe('2026-10-10')
    expect(isoDateInTimeZone(instant, 'UTC')).toBe('2026-10-09')
  })
})

describe('zonedDateTime', () => {
  it('converts Berlin wall-clock time in summer and winter', () => {
    expect(zonedDateTime('2026-07-01', '14:30', 'Europe/Berlin').toISOString()).toBe('2026-07-01T12:30:00.000Z')
    expect(zonedDateTime('2026-12-01', '14:30', 'Europe/Berlin').toISOString()).toBe('2026-12-01T13:30:00.000Z')
  })

  it('handles the DST switch day', () => {
    expect(zonedDateTime('2026-10-25', '10:00', 'Europe/Berlin').toISOString()).toBe('2026-10-25T09:00:00.000Z')
  })
})
