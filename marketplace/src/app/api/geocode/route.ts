import { NextResponse, type NextRequest } from 'next/server'
import { parseMapbox, parseNominatim } from '@/lib/geocode'
import { createClient } from '@/lib/supabase/server'

/**
 * Address → coordinates for the listing wizard (signed-in users only, to protect
 * the geocoding quota). Mapbox when a token is configured, else OpenStreetMap
 * Nominatim (fine for low volumes; see its usage policy).
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200)
  if (q.length < 3) return NextResponse.json({ error: 'query_too_short' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })

  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  try {
    if (token) {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=zw&limit=1&access_token=${token}`
      const point = parseMapbox(await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json())
      return point ? NextResponse.json(point) : NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=zw&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { 'user-agent': 'PropertyFinder/1.0 (listing geocoding)' }, signal: AbortSignal.timeout(8000) })
    const point = parseNominatim(await res.json())
    return point ? NextResponse.json(point) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'geocoder_unavailable' }, { status: 502 })
  }
}
