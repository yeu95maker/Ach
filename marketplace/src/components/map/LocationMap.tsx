'use client'
import type { PropertyCard } from '@/lib/types'
import { PropertyMap } from './index'

/** Property page map: approximate area circle, or a pin when the provider shows the exact location. */
export function LocationMap({ property, exact }: { property: PropertyCard; exact: boolean }) {
  return (
    <div className="h-64 overflow-hidden rounded-2xl ring-1 ring-gray-200">
      <PropertyMap
        properties={exact ? [property] : []}
        center={[property.lat, property.lng]}
        zoom={exact ? 15 : 14}
        area={exact ? null : { lat: property.lat, lng: property.lng, radiusM: 450 }}
      />
    </div>
  )
}
