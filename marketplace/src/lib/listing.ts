import { featuresFor, hasRooms } from './filters'
import type { MessageKey } from './i18n'
import type { Category, Feature, NearbyPlace, PropertyStatus } from './types'

/** Listing wizard state (exact coordinates included – only the owner ever sees them). */
export interface ListingDraft {
  id: string
  status: PropertyStatus | null
  category: Category | null
  country: string
  city: string
  area: string
  latitude: number | null
  longitude: number | null
  show_exact_location: boolean
  price: number | null
  land_size_m2: number | null
  living_area_m2: number | null
  bedrooms: number | null
  bathrooms: number | null
  parking_spaces: number | null
  features: Feature[]
  images: string[]
  title: string
  description: string
  nearby: NearbyPlace[]
}

export const WIZARD_STEPS = ['category', 'location', 'price', 'size', 'details', 'photos', 'description', 'preview', 'submit'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]
export const MAX_IMAGES = 30

export function emptyDraft(id: string): ListingDraft {
  return {
    id, status: null, category: null, country: 'Zimbabwe', city: 'Harare', area: '', latitude: null, longitude: null,
    show_exact_location: false, price: null, land_size_m2: null, living_area_m2: null, bedrooms: null, bathrooms: null,
    parking_spaces: null, features: [], images: [], title: '', description: '', nearby: [],
  }
}

/** Maps a row from get_my_property() into the wizard state. */
export function draftFromRow(row: Record<string, unknown>): ListingDraft {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(row.id),
    status: row.status as PropertyStatus,
    category: row.category as Category,
    country: String(row.country ?? ''),
    city: String(row.city ?? ''),
    area: String(row.area ?? ''),
    latitude: n(row.latitude),
    longitude: n(row.longitude),
    show_exact_location: Boolean(row.show_exact_location),
    price: n(row.price),
    land_size_m2: n(row.land_size_m2),
    living_area_m2: n(row.living_area_m2),
    bedrooms: n(row.bedrooms),
    bathrooms: n(row.bathrooms),
    parking_spaces: n(row.parking_spaces),
    features: (row.features as Feature[]) ?? [],
    images: (row.images as string[]) ?? [],
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    nearby: (row.nearby as NearbyPlace[]) ?? [],
  }
}

/** First problem in a step (as a message key), or null when the step is complete. */
export function validateStep(step: WizardStep, d: ListingDraft): MessageKey | null {
  switch (step) {
    case 'category':
      return d.category ? null : 'wizard.error.category'
    case 'location':
      if (d.country.trim().length < 2 || d.city.trim().length < 2 || d.area.trim().length < 2) return 'wizard.error.location'
      if (d.latitude === null || d.longitude === null) return 'wizard.error.pin'
      return null
    case 'price':
      return d.price !== null && d.price > 0 ? null : 'wizard.error.price'
    case 'size':
      if (d.category === 'land' && !(d.land_size_m2 && d.land_size_m2 > 0)) return 'wizard.error.landSize'
      if (d.category === 'apartment' && !(d.living_area_m2 && d.living_area_m2 > 0)) return 'wizard.error.livingArea'
      if (!(d.land_size_m2 && d.land_size_m2 > 0) && !(d.living_area_m2 && d.living_area_m2 > 0)) return 'wizard.error.size'
      return null
    case 'details':
      for (const v of [d.bedrooms, d.bathrooms]) if (v !== null && (v < 0 || v > 50)) return 'wizard.error.rooms'
      if (d.parking_spaces !== null && (d.parking_spaces < 0 || d.parking_spaces > 500)) return 'wizard.error.rooms'
      return null
    case 'photos':
      return d.images.length > 0 ? null : 'wizard.error.photos'
    case 'description':
      if (d.title.trim().length < 5 || d.title.trim().length > 140) return 'wizard.error.title'
      if (d.description.length > 5000) return 'wizard.error.description'
      return null
    default:
      return null
  }
}

/** First incomplete step, or null if the listing can be submitted. */
export function firstInvalidStep(d: ListingDraft): { step: WizardStep; error: MessageKey } | null {
  for (const step of WIZARD_STEPS) {
    const error = validateStep(step, d)
    if (error) return { step, error }
  }
  return null
}

/** Arguments for public.save_property(); fields that don't apply to the category are cleared. */
export function toSavePayload(d: ListingDraft, submit: boolean) {
  const rooms = hasRooms(d.category ?? undefined)
  const allowed = featuresFor(d.category ?? undefined)
  return {
    p_property: {
      id: d.id,
      category: d.category,
      title: d.title.trim(),
      description: d.description.trim(),
      country: d.country.trim(),
      city: d.city.trim(),
      area: d.area.trim(),
      latitude: d.latitude,
      longitude: d.longitude,
      show_exact_location: d.show_exact_location,
      price: d.price,
      currency: 'USD',
      land_size_m2: d.category === 'apartment' ? null : d.land_size_m2,
      living_area_m2: d.category === 'land' ? null : d.living_area_m2,
      bedrooms: rooms ? d.bedrooms : null,
      bathrooms: d.category === 'land' ? null : d.bathrooms,
      parking_spaces: d.category === 'land' ? null : d.parking_spaces,
    },
    p_features: d.features.filter((f) => allowed.includes(f)),
    p_images: d.images.slice(0, MAX_IMAGES),
    p_nearby: d.nearby.filter((n) => n.name.trim().length >= 2).map((n) => ({ ...n, name: n.name.trim(), distance_m: Math.round(n.distance_m) })),
    p_submit: submit,
  }
}

/** Downscale photos before upload (mobile data is expensive): max 1600 px, JPEG. */
export async function resizeImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.type === 'image/jpeg' && file.size < 900_000) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality))
}
