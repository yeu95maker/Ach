import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

/** Web app manifest ("Add to home screen"); icons generated with the native app icons (mobile/assets). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND,
    short_name: BRAND,
    description: 'Verified properties in Zimbabwe – buy, rent and message providers in the app.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#12805e',
    icons: [48, 72, 96, 128, 192, 256, 512].map((size) => ({ src: `/icons/icon-${size}.webp`, sizes: `${size}x${size}`, type: 'image/webp', purpose: 'any' })),
  }
}
