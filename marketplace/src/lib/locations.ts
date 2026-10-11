/**
 * Launch market: Harare, Zimbabwe. Approximate suburb centres for the "Where?"
 * suggestions and to centre the map. Areas that only exist in listings are
 * added at runtime from public.list_locations().
 */
export interface KnownLocation {
  country: string
  city: string
  area?: string
  lat: number
  lng: number
  zoom: number
}

export const DEFAULT_COUNTRY = 'Zimbabwe'
export const DEFAULT_CITY = 'Harare'

export const CITIES: KnownLocation[] = [
  { country: 'Zimbabwe', city: 'Harare', lat: -17.8292, lng: 31.0522, zoom: 11 },
  { country: 'Zimbabwe', city: 'Bulawayo', lat: -20.1325, lng: 28.6265, zoom: 11 },
]

const HARARE_AREAS: [string, number, number][] = [
  ['Avondale', -17.8, 31.037],
  ['Belvedere', -17.83, 31.02],
  ['Borrowdale', -17.745, 31.095],
  ['Chisipite', -17.78, 31.12],
  ['Eastlea', -17.825, 31.07],
  ['Glen Lorne', -17.745, 31.135],
  ['Greendale', -17.815, 31.12],
  ['Harare CBD', -17.831, 31.045],
  ['Hatfield', -17.88, 31.09],
  ['Highlands', -17.8, 31.09],
  ['Mabelreign', -17.78, 31.01],
  ['Marlborough', -17.75, 30.99],
  ['Mount Pleasant', -17.772, 31.045],
  ['Msasa', -17.84, 31.12],
  ['Ruwa', -17.889, 31.241],
  ['Waterfalls', -17.89, 31.01],
]

export const AREAS: KnownLocation[] = HARARE_AREAS.map(([area, lat, lng]) => ({
  country: 'Zimbabwe', city: 'Harare', area, lat, lng, zoom: 14,
}))

const norm = (s?: string) => (s ?? '').trim().toLowerCase()

/** Best known centre for a location filter (area → city → Harare). */
export function locate(f: { city?: string; area?: string }): KnownLocation {
  const area = f.area ? AREAS.find((a) => norm(a.area) === norm(f.area)) : undefined
  if (area) return area
  const city = f.city ? CITIES.find((c) => norm(c.city) === norm(f.city)) : undefined
  return city ?? CITIES[0]
}

/** "Borrowdale, Harare" → { area, city }; a single known city name → { city }. */
export function parseWhere(input: string): { city?: string; area?: string } {
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return {}
  if (parts.length >= 2) return { area: parts[0], city: parts[1] }
  const only = parts[0]
  const city = CITIES.find((c) => norm(c.city) === norm(only))
  if (city) return { city: city.city }
  const area = AREAS.find((a) => norm(a.area) === norm(only))
  if (area) return { area: area.area, city: area.city }
  return { area: only }
}

export function whereLabel(f: { city?: string; area?: string }): string {
  return [f.area, f.city].filter(Boolean).join(', ')
}
