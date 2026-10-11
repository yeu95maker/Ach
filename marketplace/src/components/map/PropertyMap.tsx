'use client'
import * as maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike, Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { formatPriceShort } from '@/lib/format'
import type { PropertyCard } from '@/lib/types'
import { baseStyle, circlePolygon } from './style'

export type BBox = [number, number, number, number]

export interface PropertyMapProps {
  properties: PropertyCard[]
  center: [number, number]
  zoom: number
  bounds?: BBox
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** Fired after the user pans/zooms (and once after load) with the visible [w, s, e, n]. */
  onMoveEnd?: (bbox: BBox) => void
  /** Property page: show a ~radius circle instead of a pin (approximate location). */
  area?: { lat: number; lng: number; radiusM: number } | null
  interactive?: boolean
  className?: string
}

const bboxOf = (map: MapLibreMap): BBox => {
  const b = map.getBounds()
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
}

function markerLabel(p: PropertyCard) {
  return p.locked || p.price === null ? '🔒' : formatPriceShort(p.price, p.currency)
}

export default function PropertyMap({
  properties, center, zoom, bounds, selectedId, onSelect, onMoveEnd, area, interactive = true, className,
}: PropertyMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>())
  const callbacks = useRef({ onSelect, onMoveEnd })
  useEffect(() => {
    callbacks.current = { onSelect, onMoveEnd }
  })

  // Create the map once.
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: [center[1], center[0]],
      zoom,
      interactive,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    })
    if (bounds) map.fitBounds(bounds as LngLatBoundsLike, { duration: 0, padding: 20 })
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('moveend', () => callbacks.current.onMoveEnd?.(bboxOf(map)))
    // Initial viewport (tiles may still be loading – or fail – but the bounds are known).
    setTimeout(() => {
      if (mapRef.current === map) callbacks.current.onMoveEnd?.(bboxOf(map))
    }, 0)
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (!(e.originalEvent.target as HTMLElement).closest('[data-marker]')) callbacks.current.onSelect?.(null)
    })
    mapRef.current = map
    const registry = markers.current
    return () => {
      registry.clear()
      map.remove()
      mapRef.current = null
    }
    // The initial view is applied once; later changes go through flyTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-centre when the requested area changes (e.g. new search location).
  const firstView = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (firstView.current) {
      firstView.current = false
      return
    }
    if (bounds) map.fitBounds(bounds as LngLatBoundsLike, { padding: 20, duration: 600 })
    else map.flyTo({ center: [center[1], center[0]], zoom, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom, bounds?.join(',')])

  // Price markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const p of properties) {
      seen.add(p.id)
      let entry = markers.current.get(p.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.dataset.marker = p.id
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          callbacks.current.onSelect?.(p.id)
        })
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
        entry = { marker, el }
        markers.current.set(p.id, entry)
      }
      const selected = p.id === selectedId
      entry.el.textContent = markerLabel(p)
      entry.el.setAttribute('aria-label', `${p.area}: ${markerLabel(p)}`)
      entry.el.className = [
        'rounded-full px-2.5 py-1 text-[13px] font-bold shadow-md ring-1 transition-transform',
        selected ? 'z-10 scale-110 bg-gray-900 text-white ring-gray-900' : p.locked ? 'bg-gold-100 text-gold-700 ring-gold-500/40' : 'bg-white text-gray-900 ring-gray-300 hover:bg-brand-50',
      ].join(' ')
      entry.marker.getElement().style.zIndex = selected ? '10' : '1'
    }
    for (const [id, entry] of markers.current) {
      if (!seen.has(id)) {
        entry.marker.remove()
        markers.current.delete(id)
      }
    }
  }, [properties, selectedId])

  // Approximate area circle (property page).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !area) return
    const draw = () => {
      const data = circlePolygon(area.lat, area.lng, area.radiusM)
      const source = map.getSource('area') as maplibregl.GeoJSONSource | undefined
      if (source) source.setData(data)
      else {
        map.addSource('area', { type: 'geojson', data })
        map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#12805e', 'fill-opacity': 0.18 } })
        map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#12805e', 'line-width': 2 } })
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [area])

  return <div ref={container} className={className ?? 'h-full w-full'} />
}
