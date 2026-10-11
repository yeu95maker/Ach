import { describe, expect, it } from 'vitest'
import { locate, parseWhere, whereLabel } from './locations'

describe('locations', () => {
  it('parses "Where?" input', () => {
    expect(parseWhere('Borrowdale, Harare')).toEqual({ area: 'Borrowdale', city: 'Harare' })
    expect(parseWhere('harare')).toEqual({ city: 'Harare' })
    expect(parseWhere('avondale')).toEqual({ area: 'Avondale', city: 'Harare' })
    expect(parseWhere('Somewhere new')).toEqual({ area: 'Somewhere new' })
    expect(parseWhere('  ')).toEqual({})
  })
  it('centres the map on the best known location', () => {
    expect(locate({ area: 'borrowdale' }).zoom).toBe(14)
    expect(locate({ city: 'Bulawayo' }).city).toBe('Bulawayo')
    expect(locate({}).city).toBe('Harare')
  })
  it('labels', () => {
    expect(whereLabel({ area: 'Borrowdale', city: 'Harare' })).toBe('Borrowdale, Harare')
  })
})
