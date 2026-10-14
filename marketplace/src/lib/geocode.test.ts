import { describe, expect, it } from 'vitest'
import { parseMapbox, parseNominatim } from './geocode'

describe('geocode parsers', () => {
  it('reads Mapbox v6 features', () => {
    expect(parseMapbox({ features: [{ geometry: { coordinates: [31.04, -17.8] }, properties: { full_address: '12 King George Rd, Avondale, Harare' } }] }))
      .toEqual({ lat: -17.8, lng: 31.04, label: '12 King George Rd, Avondale, Harare' })
    expect(parseMapbox({ features: [] })).toBeNull()
  })
  it('reads Nominatim results', () => {
    expect(parseNominatim([{ lat: '-17.745', lon: '31.095', display_name: 'Borrowdale, Harare' }])).toEqual({ lat: -17.745, lng: 31.095, label: 'Borrowdale, Harare' })
    expect(parseNominatim([])).toBeNull()
  })
})
