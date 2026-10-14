import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/provider', '/messages', '/saved', '/profile', '/notifications', '/membership/return', '/api/', '/login', '/signup', '/search?*bbox='],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
