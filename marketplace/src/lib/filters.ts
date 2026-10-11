import { CATEGORIES, FEATURES, type Category, type Feature } from './types'

export const SORTS = ['newest', 'price_asc', 'price_desc', 'size_desc'] as const
export type Sort = (typeof SORTS)[number]

/** Search filters – the same keys the database understands (private.property_matches). */
export interface Filters {
  category?: Category
  country?: string
  city?: string
  area?: string
  min_price?: number
  max_price?: number
  min_size?: number
  max_size?: number
  min_bedrooms?: number
  min_bathrooms?: number
  /** Premium-only filters */
  features?: Feature[]
  min_living_area?: number
  min_parking?: number
  max_age_days?: number
  /** [west, south, east, north] */
  bbox?: [number, number, number, number]
  provider_id?: string
  sort?: Sort
}

/** Keep in sync with private.uses_advanced_filters(). */
export const ADVANCED_FILTER_KEYS = ['features', 'min_living_area', 'min_parking', 'max_age_days'] as const

const NUMBER_KEYS = [
  'min_price', 'max_price', 'min_size', 'max_size', 'min_bedrooms', 'min_bathrooms',
  'min_living_area', 'min_parking', 'max_age_days',
] as const
const TEXT_KEYS = ['country', 'city', 'area'] as const

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

function read(source: ParamSource, key: string): string | undefined {
  const raw = source instanceof URLSearchParams ? source.get(key) : source[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parses URL search params into validated filters; anything invalid is dropped. */
export function parseFilters(source: ParamSource): Filters {
  const f: Filters = {}
  const category = read(source, 'category')
  if (category && (CATEGORIES as readonly string[]).includes(category)) f.category = category as Category

  for (const key of TEXT_KEYS) {
    const v = read(source, key)
    if (v) f[key] = v.slice(0, 80)
  }
  for (const key of NUMBER_KEYS) {
    const v = read(source, key)
    if (v === undefined) continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0 && n < 1e12) f[key] = n
  }
  const features = read(source, 'features')
  if (features) {
    const list = features.split(',').filter((x): x is Feature => (FEATURES as readonly string[]).includes(x))
    if (list.length) f.features = [...new Set(list)]
  }
  const bbox = read(source, 'bbox')
  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts
      if (w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n) f.bbox = [w, s, e, n]
    }
  }
  const provider = read(source, 'provider_id')
  if (provider && UUID.test(provider)) f.provider_id = provider
  const sort = read(source, 'sort')
  if (sort && (SORTS as readonly string[]).includes(sort)) f.sort = sort as Sort
  return f
}

/** Inverse of parseFilters: compact URL query (no empty values). */
export function filtersToQuery(f: Filters, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(f)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      params.set(key, key === 'bbox' ? value.map((n) => Number(n).toFixed(5)).join(',') : value.join(','))
    } else params.set(key, String(value))
  }
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value)
  return params.toString()
}

export function usesAdvancedFilters(f: Filters): boolean {
  return (
    (f.features?.length ?? 0) > 0 ||
    f.min_living_area !== undefined ||
    f.min_parking !== undefined ||
    f.max_age_days !== undefined
  )
}

export function withoutAdvancedFilters(f: Filters): Filters {
  const copy = { ...f }
  for (const key of ADVANCED_FILTER_KEYS) delete copy[key]
  return copy
}

/** Number of active filters shown on the "Filters" button (location and sort excluded). */
export function countActiveFilters(f: Filters): number {
  const keys: (keyof Filters)[] = [
    'min_price', 'max_price', 'min_size', 'max_size', 'min_bedrooms', 'min_bathrooms',
    'min_living_area', 'min_parking', 'max_age_days',
  ]
  return keys.filter((k) => f[k] !== undefined).length + (f.features?.length ? 1 : 0)
}

/** Which categories have bedrooms/bathrooms. */
export const hasRooms = (c?: Category) => c === undefined || c === 'house' || c === 'apartment'

/** Features that make sense per category (wizard + filter sheet). */
export function featuresFor(c?: Category): Feature[] {
  switch (c) {
    case 'land':
      return ['electricity', 'water', 'road_access']
    case 'apartment':
      return ['parking', 'balcony', 'terrace', 'garden', 'pool', 'electricity', 'water']
    case 'commercial':
      return ['parking', 'garage', 'electricity', 'water', 'road_access']
    default:
      return [...FEATURES]
  }
}
