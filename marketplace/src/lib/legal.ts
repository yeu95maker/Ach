import { BRAND } from './brand'

/**
 * Operator details for the legal pages (privacy policy, terms, imprint, support).
 * Set them in the hosting environment before going live – the app stores
 * require a reachable privacy policy and support contact, and a German
 * operator must publish an imprint (§ 5 DDG).
 */
export const LEGAL = {
  brand: BRAND,
  name: process.env.LEGAL_NAME || `${BRAND} (operator details pending)`,
  address: process.env.LEGAL_ADDRESS || '',
  email: process.env.SUPPORT_EMAIL || 'support@example.com',
  phone: process.env.SUPPORT_PHONE || '',
  updated: '2026-10-14',
}

export const LEGAL_LINKS = [
  { href: '/privacy', key: 'legal.privacy' },
  { href: '/terms', key: 'legal.terms' },
  { href: '/imprint', key: 'legal.imprint' },
  { href: '/support', key: 'legal.support' },
] as const
