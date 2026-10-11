'use client'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { baseStyle } from './style'

/** Tap the map (or drag the pin) to set the exact position of a listing. */
export default function LocationPicker({
  value, center, onChange,
}: {
  value: { lat: number; lng: number } | null
  center: { lat: number; lng: number; zoom: number }
  onChange: (pos: { lat: number; lng: number }) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!container.current) return
    const start = value ?? center
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: [start.lng, start.lat],
      zoom: value ? 15 : center.zoom,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const place = (lng: number, lat: number) => {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: '#12805e', draggable: true }).setLngLat([lng, lat]).addTo(map)
        markerRef.current.on('dragend', () => {
          const p = markerRef.current?.getLngLat()
          if (!p) return
          onChangeRef.current({ lat: round(p.lat), lng: round(p.lng) })
        })
      } else markerRef.current.setLngLat([lng, lat])
    }
    if (value) place(value.lng, value.lat)
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      place(e.lngLat.lng, e.lngLat.lat)
      onChangeRef.current({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) })
    })
    mapRef.current = map
    return () => {
      map.remove()
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the selected area when no pin is set yet.
  useEffect(() => {
    if (!value && mapRef.current) mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: center.zoom, duration: 500 })
  }, [center.lat, center.lng, center.zoom, value])

  return <div ref={container} className="h-72 w-full overflow-hidden rounded-xl ring-1 ring-gray-300" />
}

const round = (n: number) => Math.round(n * 1e6) / 1e6
