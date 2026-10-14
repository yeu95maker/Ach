/** Normalises geocoder responses (Mapbox Geocoding v6 or OpenStreetMap Nominatim) to one point. */
export interface GeoPoint {
  lat: number
  lng: number
  label: string
}

export function parseMapbox(json: unknown): GeoPoint | null {
  const f = (json as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { full_address?: string; name?: string } }[] })?.features?.[0]
  const c = f?.geometry?.coordinates
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null
  return { lng: c[0], lat: c[1], label: f?.properties?.full_address ?? f?.properties?.name ?? '' }
}

export function parseNominatim(json: unknown): GeoPoint | null {
  const r = (json as { lat?: string; lon?: string; display_name?: string }[])?.[0]
  const lat = Number(r?.lat)
  const lng = Number(r?.lon)
  if (!r || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, label: r.display_name ?? '' }
}
