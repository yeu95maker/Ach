import { describe, expect, it } from 'vitest'
import { IMPORT_TEMPLATE, parseAmount, parseCategory, parseCsv, parseFeatures, parseTransaction, rowsToDrafts } from './import'

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

describe('CSV import', () => {
  it('parses quotes, escaped quotes, newlines and semicolon files', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
    expect(parseCsv('﻿a;b\r\n1;"2\n3"')).toEqual([['a', 'b'], ['1', '2\n3']])
    expect(parseCsv('a,b\n\n , \n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('understands local wording', () => {
    expect(parseCategory('Stand')).toBe('land')
    expect(parseCategory('Cluster house')).toBe('apartment')
    expect(parseCategory('Office block')).toBe('commercial')
    expect(parseCategory('Grundstück')).toBe('land')
    expect(parseCategory('boat')).toBeNull()
    expect(parseCategory('Room')).toBe('room')
    expect(parseCategory('3 bedroom house')).toBe('house')
    expect(parseTransaction('To let')).toBe('rent')
    expect(parseTransaction('')).toBe('sale')
    expect(parseFeatures('Water; road access | Borehole / pool / jacuzzi')).toEqual(['water', 'road_access', 'pool'])
    expect(parseAmount('$25,000')).toBe(25000)
    expect(parseAmount('USD 1 200')).toBe(1200)
    expect(parseAmount('n/a')).toBeNull()
  })
  it('turns the template into valid drafts', () => {
    const { rows, missingColumns } = rowsToDrafts(parseCsv(IMPORT_TEMPLATE), id)
    expect(missingColumns).toEqual([])
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.draft && r.errors.length === 0)).toBe(true)
    expect(rows[0].draft).toMatchObject({ category: 'land', area: 'Borrowdale', price: 25000, land_size_m2: 500, features: ['water', 'electricity', 'road_access'] })
    expect(rows[0].approximatePin).toBe(true)
    expect(rows[1].approximatePin).toBe(false)
    expect(rows[1].draft).toMatchObject({ latitude: -17.772, longitude: 31.045, bedrooms: 4, year_built: 1998, transaction: 'sale' })
    expect(rows[2].draft).toMatchObject({ transaction: 'rent', category: 'apartment', price: 650, deposit: 650, additional_costs: 40,
      available_from: '2026-12-01', floor: 2, street_address: '12 King George Rd', features: ['furnished', 'backup_power', 'security'] })
  })
  it('reports problems per row and missing columns', () => {
    expect(rowsToDrafts(parseCsv('title,price\nx,1'), id).missingColumns).toEqual(['type', 'price_usd', 'area'])
    const { rows } = rowsToDrafts(parseCsv('type,price_usd,area,land_size_m2\nboat,1,Avondale,100\nland,,Avondale,100\nland,5000,Avondale,'), id)
    expect(rows.map((r) => r.errors)).toEqual([['import.error.type'], ['wizard.error.price'], ['wizard.error.landSize']])
  })
})
