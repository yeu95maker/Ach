import { describe, expect, it } from 'vitest'
import { draftFromRow, emptyDraft, firstInvalidStep, toSavePayload, validateStep, type ListingDraft } from './listing'

const complete = (patch: Partial<ListingDraft> = {}): ListingDraft => ({
  ...emptyDraft('11111111-1111-4111-8111-111111111111'),
  category: 'house', area: 'Borrowdale', latitude: -17.74, longitude: 31.09, price: 180000,
  land_size_m2: 1200, living_area_m2: 240, bedrooms: 4, bathrooms: 3, images: ['p/x/1.jpg'], title: 'Modern Family House',
  ...patch,
})

describe('listing wizard validation', () => {
  it('walks through the steps', () => {
    const d = emptyDraft('id')
    expect(firstInvalidStep(d)).toEqual({ step: 'category', error: 'wizard.error.category' })
    expect(validateStep('location', { ...d, area: 'Avondale' })).toBe('wizard.error.pin')
    expect(firstInvalidStep(complete())).toBeNull()
  })
  it('requires the right size per category', () => {
    expect(validateStep('size', complete({ category: 'land', land_size_m2: null }))).toBe('wizard.error.landSize')
    expect(validateStep('size', complete({ category: 'apartment', living_area_m2: null }))).toBe('wizard.error.livingArea')
    expect(validateStep('size', complete({ category: 'commercial', land_size_m2: null, living_area_m2: null }))).toBe('wizard.error.size')
  })
  it('validates title, photos and numbers', () => {
    expect(validateStep('description', complete({ title: 'Hut' }))).toBe('wizard.error.title')
    expect(validateStep('photos', complete({ images: [] }))).toBe('wizard.error.photos')
    expect(validateStep('details', complete({ bedrooms: 99 }))).toBe('wizard.error.rooms')
  })
})

describe('toSavePayload', () => {
  it('clears fields that do not apply to land', () => {
    const p = toSavePayload(complete({ category: 'land', features: ['garage', 'water'], bedrooms: 3, nearby: [{ kind: 'school', name: ' ', distance_m: 3 }] }), true)
    expect(p.p_property).toMatchObject({ category: 'land', living_area_m2: null, bedrooms: null, bathrooms: null, parking_spaces: null })
    expect(p.p_features).toEqual(['water'])
    expect(p.p_nearby).toEqual([])
    expect(p.p_submit).toBe(true)
  })
  it('round-trips a database row', () => {
    const d = draftFromRow({ id: 'x', status: 'active', category: 'apartment', country: 'Zimbabwe', city: 'Harare', area: 'Avondale',
      latitude: -17.8, longitude: 31.04, price: '65000.00', land_size_m2: null, living_area_m2: '85.00', bedrooms: 2, title: 'Flat', features: ['balcony'], images: [], nearby: [] })
    expect(d.price).toBe(65000)
    expect(d.living_area_m2).toBe(85)
    expect(toSavePayload(d, false).p_property.land_size_m2).toBeNull()
  })
})
