import { SUPABASE_URL } from './supabase/env'

/**
 * Listing photos are stored in the public "property-images" bucket. Absolute
 * URLs and root-relative paths (demo images in /public) are used as they are.
 */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path
  return `${SUPABASE_URL}/storage/v1/object/public/property-images/${path.split('/').map(encodeURIComponent).join('/')}`
}
