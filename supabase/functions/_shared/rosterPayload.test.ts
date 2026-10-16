import { describe, expect, it } from 'vitest'
import { readApiKey, validateRosterPayload } from './rosterPayload.ts'

const valid = {
  unit: '3A',
  period: { start: '2026-11-01', end: '2026-11-30' },
  shifts: [
    { employee: 'P-1001', date: '2026-11-02', code: 'F' },
    { employee: 'P-1002', date: '2026-11-02', start: '21:45', end: '06:15', break_minutes: 30, id: 'x-1' },
  ],
}

describe('Dienstwerk Roster Exchange v1', () => {
  it('accepts a valid delivery and an empty one (clears the period)', () => {
    expect(validateRosterPayload(valid).ok).toBe(true)
    expect(validateRosterPayload({ ...valid, shifts: [] }).ok).toBe(true)
  })

  it('reports precise errors', () => {
    const r = validateRosterPayload({
      unit: '',
      period: { start: '2026-11-30', end: '2026-11-01' },
      shifts: [{ employee: 'P-1', date: '02.11.2026' }, { employee: 'P-2', date: '2026-11-03', start: '25:00' }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toContain('unit: ward code (1–32 characters) required')
    expect(r.errors).toContain('period: end must be on or after start, at most 63 days')
    expect(r.errors).toContain('shifts[0].date: YYYY-MM-DD required')
    expect(r.errors).toContain('shifts[0]: code or start/end required')
    expect(r.errors).toContain('shifts[1].start: HH:MM')
    expect(r.errors).toContain('shifts[1]: start and end only together')
  })

  it('rejects non-objects and oversized deliveries', () => {
    expect(validateRosterPayload([]).ok).toBe(false)
    expect(validateRosterPayload(null).ok).toBe(false)
    const big = { ...valid, shifts: Array.from({ length: 10_001 }, () => valid.shifts[0]) }
    expect(validateRosterPayload(big)).toEqual({ ok: false, errors: ['shifts: at most 10000 entries'] })
  })

  it('reads the key from Authorization or X-Dienstwerk-Key', () => {
    expect(readApiKey(new Headers({ authorization: 'Bearer pls_abc' }))).toBe('pls_abc')
    expect(readApiKey(new Headers({ 'x-dienstwerk-key': 'pls_def' }))).toBe('pls_def')
    expect(readApiKey(new Headers())).toBeNull()
  })
})
