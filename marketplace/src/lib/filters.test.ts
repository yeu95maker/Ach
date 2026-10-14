import { describe, expect, it } from 'vitest'
import { countActiveFilters, featuresFor, filtersToQuery, parseFilters, usesAdvancedFilters, withoutAdvancedFilters } from './filters'

describe('parseFilters', () => {
  it('parses valid values and drops invalid ones', () => {
    const f = parseFilters(new URLSearchParams('category=land&area=Borrowdale&min_price=10000&max_price=abc&features=garage,bogus,garage&sort=price_asc&provider_id=nope'))
    expect(f).toEqual({ category: 'land', area: 'Borrowdale', min_price: 10000, features: ['garage'], sort: 'price_asc' })
  })
  it('accepts record-style search params (Next.js page props)', () => {
    expect(parseFilters({ category: ['house', 'land'], min_bedrooms: '3', city: '  ' })).toEqual({ category: 'house', min_bedrooms: 3 })
  })
  it('validates bounding boxes', () => {
    expect(parseFilters({ bbox: '31.0,-17.9,31.1,-17.7' }).bbox).toEqual([31, -17.9, 31.1, -17.7])
    expect(parseFilters({ bbox: '31.1,-17.9,31.0,-17.7' }).bbox).toBeUndefined()
    expect(parseFilters({ bbox: '1,2,3' }).bbox).toBeUndefined()
  })
  it('rejects negative numbers and unknown categories', () => {
    expect(parseFilters({ min_price: '-5', category: 'castle' })).toEqual({})
  })
})

describe('filtersToQuery', () => {
  it('round-trips', () => {
    const f = parseFilters({ category: 'house', city: 'Harare', area: 'Borrowdale', min_price: '100000', max_price: '250000', min_bedrooms: '3', features: 'garage,garden' })
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f)
  })
  it('omits empty values and adds extras', () => {
    expect(filtersToQuery({ category: undefined, features: [] }, { view: 'map', x: undefined })).toBe('view=map')
  })
})

describe('premium filters', () => {
  it('detects and strips advanced filters', () => {
    const f = { area: 'Avondale', features: ['pool' as const], max_age_days: 7 }
    expect(usesAdvancedFilters(f)).toBe(true)
    expect(withoutAdvancedFilters(f)).toEqual({ area: 'Avondale' })
    expect(usesAdvancedFilters({ min_price: 1, min_bedrooms: 2 })).toBe(false)
  })
  it('counts active filters without location', () => {
    expect(countActiveFilters({ city: 'Harare', min_price: 1, max_price: 2, features: ['pool', 'garage'] })).toBe(3)
  })
  it('offers only meaningful features per category', () => {
    expect(featuresFor('land')).toEqual(['electricity', 'water', 'borehole', 'road_access'])
    expect(featuresFor('room')).toContain('furnished')
    expect(featuresFor('house')).toContain('garage')
  })
})

describe('rentals and radius', () => {
  it('parses transaction, move-in date and radius', () => {
    expect(parseFilters({ transaction: 'rent', available_by: '2026-12-01', near: '-17.8,31.04', radius_km: '5', place: 'Avondale' }))
      .toEqual({ transaction: 'rent', available_by: '2026-12-01', near: [-17.8, 31.04], radius_km: 5, place: 'Avondale' })
    expect(parseFilters({ transaction: 'lease', available_by: 'soon', near: '1,2', radius_km: '500' })).toEqual({})
  })
  it('round-trips radius filters', () => {
    const f = parseFilters({ transaction: 'rent', near: '-17.80000,31.04000', radius_km: '3', place: 'Avondale' })
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f)
  })
})
