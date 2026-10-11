import { en } from './dictionaries/en'
import { de } from './dictionaries/de'
import type { Locale } from '../format'

export type { Locale }
export type MessageKey = keyof typeof en
export type Dictionary = Record<MessageKey, string>
export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string

export const LOCALES: Locale[] = ['en', 'de']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'locale'

const dictionaries: Record<Locale, Dictionary> = { en, de }

export const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'de'

export function createT(locale: Locale): TFunction {
  const dict = dictionaries[locale] ?? en
  return (key, vars) => {
    let text: string = dict[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
    return text
  }
}
