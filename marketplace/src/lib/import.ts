import type { MessageKey } from './i18n'
import { emptyDraft, validateStep, type ListingDraft } from './listing'
import { AREAS, CITIES, locate } from './locations'
import { FEATURES, type Category, type Feature, type Transaction } from './types'

/**
 * Bulk import for providers: a spreadsheet (CSV) of their existing stock becomes
 * listing drafts. Photos are added per listing afterwards (required to submit),
 * so every listing is still reviewed before it goes live.
 */
export const IMPORT_COLUMNS = [
  'transaction', 'type', 'title', 'price_usd', 'city', 'area', 'street_address', 'land_size_m2', 'living_area_m2',
  'bedrooms', 'bathrooms', 'parking_spaces', 'floor', 'year_built', 'features', 'description',
  'deposit_usd', 'additional_costs_usd', 'available_from', 'latitude', 'longitude', 'country',
] as const

export const IMPORT_TEMPLATE = [
  IMPORT_COLUMNS.join(','),
  'sale,stand,Residential Stand,25000,Harare,Borrowdale,,500,,,,,,,water;electricity;road access,"Serviced stand, title deeds available.",,,,,,Zimbabwe',
  'sale,house,Family Home,155000,Harare,Mount Pleasant,,1400,210,4,2,2,,1998,garage;garden;borehole,"Close to the university.",,,,-17.772,31.045,Zimbabwe',
  'rent,flat,Furnished 2-Bed Flat,650,Harare,Avondale,12 King George Rd,,90,2,1,1,2,2012,furnished;backup power;security,"Walk to Avondale shops.",650,40,2026-12-01,,,Zimbabwe',
].join('\n')

export const MAX_IMPORT_ROWS = 200

/** RFC 4180-ish CSV parser (quotes, escaped quotes, newlines in quotes, BOM, `,` or `;` delimiter). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const CATEGORY_WORDS: Record<string, Category> = {
  apartment: 'apartment', flat: 'apartment', cluster: 'apartment', wohnung: 'apartment',
  house: 'house', home: 'house', townhouse: 'house', cottage: 'house', haus: 'house',
  land: 'land', stand: 'land', plot: 'land', farm: 'land', grundstück: 'land', grundstueck: 'land',
  commercial: 'commercial', office: 'commercial', shop: 'commercial', warehouse: 'commercial', industrial: 'commercial', gewerbe: 'commercial',
  room: 'room', lodging: 'room', bedsitter: 'room', zimmer: 'room',
}

/** "rent", "to let", "lease", "Miete" → rent; anything else is a sale. */
export function parseTransaction(value: string): Transaction {
  return /rent|let|lease|miet/i.test(value) ? 'rent' : 'sale'
}

export function parseCategory(value: string): Category | null {
  const v = value.trim().toLowerCase()
  if (CATEGORY_WORDS[v]) return CATEGORY_WORDS[v]
  const word = Object.keys(CATEGORY_WORDS).find((w) => v.includes(w))
  return word ? CATEGORY_WORDS[word] : null
}

export function parseFeatures(value: string): Feature[] {
  return [...new Set(value.split(/[;|/]+/).map((f) => f.trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .map((f) => (f === 'parking_space' ? 'parking' : f === 'borehole' ? 'water' : f))
    .filter((f): f is Feature => (FEATURES as readonly string[]).includes(f)))]
}

/** "$25,000", "25 000", "USD 25000" → 25000 */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/usd|us\$|\$|m²|m2|sqm/gi, '').replace(/[\s,]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export interface ImportRow {
  line: number
  draft: ListingDraft | null
  errors: MessageKey[]
  /** No coordinates given – placed at the area centre, to be corrected in the wizard. */
  approximatePin: boolean
}

export function rowsToDrafts(rows: string[][], newId: () => string): { rows: ImportRow[]; missingColumns: string[] } {
  if (!rows.length) return { rows: [], missingColumns: ['type', 'price_usd', 'area'] }
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  const col = (name: string) => header.indexOf(name)
  const missingColumns = ['type', 'price_usd', 'area'].filter((c) => col(c) < 0)
  if (missingColumns.length) return { rows: [], missingColumns }

  const result: ImportRow[] = rows.slice(1, MAX_IMPORT_ROWS + 1).map((cells, i) => {
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '')
    const num = (name: string) => parseAmount(get(name))
    const errors: MessageKey[] = []
    const category = parseCategory(get('type'))
    const transaction = parseTransaction(`${get('transaction')} ${get('type')}`)
    const availableFrom = /^\d{4}-\d{2}-\d{2}$/.test(get('available_from')) ? get('available_from') : null
    if (!category) errors.push('import.error.type')

    const city = get('city') || 'Harare'
    const area = get('area')
    const knownArea = AREAS.find((a) => a.area?.toLowerCase() === area.toLowerCase())
    const knownCity = CITIES.find((c) => c.city.toLowerCase() === city.toLowerCase())
    let lat = get('latitude') ? Number(get('latitude')) : null
    let lng = get('longitude') ? Number(get('longitude')) : null
    if (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) lat = null
    if (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180)) lng = null
    const approximatePin = lat === null || lng === null
    if (approximatePin) {
      const centre = locate({ city, area })
      lat = centre.lat
      lng = centre.lng
    }

    const draft: ListingDraft = {
      ...emptyDraft(newId()),
      category,
      country: get('country') || knownCity?.country || 'Zimbabwe',
      city: knownCity?.city ?? city,
      area: knownArea?.area ?? area,
      transaction,
      street_address: get('street_address'),
      deposit: transaction === 'rent' ? num('deposit_usd') ?? num('deposit') : null,
      additional_costs: transaction === 'rent' ? num('additional_costs_usd') ?? num('additional_costs') : null,
      available_from: transaction === 'rent' ? availableFrom : null,
      floor: get('floor') && Number.isFinite(Number(get('floor'))) ? Number(get('floor')) : null,
      year_built: num('year_built'),
      latitude: lat,
      longitude: lng,
      price: num('price_usd') ?? num('price'),
      land_size_m2: num('land_size_m2'),
      living_area_m2: num('living_area_m2'),
      bedrooms: num('bedrooms'),
      bathrooms: num('bathrooms'),
      parking_spaces: num('parking_spaces'),
      features: parseFeatures(get('features')),
      title: get('title') || (category && area ? `${category[0].toUpperCase()}${category.slice(1)}${transaction === 'rent' ? ' to let' : ''} – ${area}` : ''),
      description: get('description'),
    }
    for (const step of ['location', 'price', 'size', 'details', 'description'] as const) {
      const e = category ? validateStep(step, draft) : null
      if (e) errors.push(e)
    }
    return { line: i + 2, draft: errors.length ? null : draft, errors, approximatePin }
  })
  return { rows: result, missingColumns: [] }
}
