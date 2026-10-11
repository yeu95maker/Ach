import { describe, expect, it } from 'vitest'
import { daysAgo, formatArea, formatDistance, formatPrice, formatPriceShort, hoursUntil, primarySize } from './format'

describe('format', () => {
  it('formats prices', () => {
    expect(formatPrice(180000)).toBe('$180,000')
    expect(formatPrice(180000, 'USD', 'de')).toMatch(/180\.000\s\$/)
  })
  it('formats map marker prices', () => {
    expect(formatPriceShort(25000)).toBe('$25K')
    expect(formatPriceShort(1_250_000)).toBe('$1.3M')
    expect(formatPriceShort(450000)).toBe('$450K')
    expect(formatPriceShort(800)).toBe('$800')
  })
  it('formats sizes and distances', () => {
    expect(formatArea(1200)).toBe('1,200 m²')
    expect(formatDistance(700)).toBe('700 m')
    expect(formatDistance(2100)).toBe('2.1 km')
  })
  it('computes relative times', () => {
    const now = new Date('2026-10-11T12:00:00Z')
    expect(daysAgo('2026-10-08T11:00:00Z', now)).toBe(3)
    expect(daysAgo('2026-10-12T00:00:00Z', now)).toBe(0)
    expect(hoursUntil('2026-10-12T10:30:00Z', now)).toBe(23)
    expect(hoursUntil('2026-10-10T10:30:00Z', now)).toBe(0)
  })
  it('uses plot size, else living area', () => {
    expect(primarySize({ land_size_m2: 500, living_area_m2: 120 })).toBe(500)
    expect(primarySize({ land_size_m2: null, living_area_m2: 85 })).toBe(85)
  })
})
