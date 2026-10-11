import type { Feature, Polygon } from 'geojson'
import type { StyleSpecification } from 'maplibre-gl'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

/**
 * Base map. With a Mapbox token the Mapbox Streets style is used (Static Tiles
 * API, rendered with MapLibre GL); without one we fall back to OpenStreetMap
 * tiles, which is only acceptable for local development (OSM tile policy).
 */
export function baseStyle(): StyleSpecification {
  const tiles = MAPBOX_TOKEN
    ? [`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`]
    : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
  const attribution = MAPBOX_TOKEN
    ? '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles, tileSize: MAPBOX_TOKEN ? 512 : 256, attribution, maxzoom: 19 },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8ecef' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  }
}

/** GeoJSON polygon approximating a circle (for "the property is somewhere around here"). */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48): Feature<Polygon> {
  const coords: [number, number][] = []
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}
