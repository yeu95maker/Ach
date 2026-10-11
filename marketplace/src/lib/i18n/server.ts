import 'server-only'
import { cookies, headers } from 'next/headers'
import { createT, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './index'

/** Locale from the cookie (set in Profile), else the browser language, else English. */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) return fromCookie
  const accept = (await headers()).get('accept-language') ?? ''
  return accept.toLowerCase().startsWith('de') ? 'de' : DEFAULT_LOCALE
}

export async function getT() {
  const locale = await getLocale()
  return { t: createT(locale), locale }
}
