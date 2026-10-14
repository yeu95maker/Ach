export type Locale = 'en' | 'de'

const intlLocale = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-US')

/** "$180,000" (en) / "180.000 $" (de). */
export function formatPrice(amount: number, currency = 'USD', locale: Locale = 'en'): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

/** Compact price for map markers: "$25K", "$1.2M". */
export function formatPriceShort(amount: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `
  if (amount >= 1_000_000) return `${symbol}${trim(amount / 1_000_000)}M`
  if (amount >= 1_000) return `${symbol}${trim(amount / 1_000)}K`
  return `${symbol}${Math.round(amount)}`
}

const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString())

export function formatArea(m2: number, locale: Locale = 'en'): string {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(m2)} m²`
}

export function formatDistance(meters: number, locale: Locale = 'en'): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(meters / 1000)} km`
}

export function formatDate(iso: string, locale: Locale = 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function formatTime(iso: string, locale: Locale = 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Whole days between an ISO timestamp and now (never negative). */
export function daysAgo(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
}

/** Hours (rounded up) until an ISO timestamp; 0 when in the past. */
export function hoursUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 3_600_000))
}

/** Map marker: "$25K" for sales, "$650" for monthly rents. */
export function markerPrice(amount: number, currency: string, transaction: 'sale' | 'rent'): string {
  return transaction === 'rent' && amount < 10_000 ? `${currency === 'USD' ? '$' : `${currency} `}${Math.round(amount)}` : formatPriceShort(amount, currency)
}

/** Size shown on cards: plot size, or living area where there is no plot. */
export function primarySize(p: { land_size_m2: number | null; living_area_m2: number | null }): number | null {
  return p.land_size_m2 ?? p.living_area_m2 ?? null
}
