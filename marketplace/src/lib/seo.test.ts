import { describe, expect, it } from 'vitest'
import { landingFilters, landingPath, parseLanding, placeFromSlug, popularLandings, slugify } from './seo'

describe('SEO landing pages', () => {
  it('slugifies', () => {
    expect(slugify('Mount Pleasant')).toBe('mount-pleasant')
    expect(slugify('Grundstück & Haus')).toBe('grundstuck-haus')
  })
  it('resolves places and landings', () => {
    expect(placeFromSlug('mount-pleasant')).toEqual({ city: 'Harare', area: 'Mount Pleasant', name: 'Mount Pleasant' })
    expect(placeFromSlug('harare')).toEqual({ city: 'Harare', name: 'Harare' })
    expect(placeFromSlug('atlantis')).toBeNull()
    const l = parseLanding('rent', 'apartments', 'avondale')!
    expect(landingFilters(l)).toEqual({ transaction: 'rent', category: 'apartment', country: 'Zimbabwe', city: 'Harare', area: 'Avondale' })
    expect(parseLanding('buy', 'rooms', 'harare')).toBeNull()
    expect(parseLanding('lease', 'land', 'harare')).toBeNull()
    expect(landingFilters(parseLanding('buy', 'property', 'harare')!)).toEqual({ transaction: 'sale', country: 'Zimbabwe', city: 'Harare' })
  })
  it('builds paths that parse back', () => {
    for (const p of popularLandings()) {
      const [, tx, cat, place] = landingPath(p.tx, p.category, p.place).split('/')
      expect(parseLanding(tx, cat, place)).not.toBeNull()
    }
    expect(landingPath('sale', 'land', 'Glen Lorne')).toBe('/buy/land/glen-lorne')
  })
})
