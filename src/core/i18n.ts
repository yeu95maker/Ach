import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from '@/locales/de.json'

/**
 * Localisation.
 * German ships in the main bundle (default + fallback); all other languages
 * are code-split and loaded on demand. Adding a language = add
 * src/locales/<code>.json, list it here and set languages.is_ui_available.
 */
export const UI_LANGUAGES = ['de', 'en', 'tr', 'ro', 'pl'] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

const loaders: Record<Exclude<UiLanguage, 'de'>, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('@/locales/en.json'),
  tr: () => import('@/locales/tr.json'),
  ro: () => import('@/locales/ro.json'),
  pl: () => import('@/locales/pl.json'),
}

const STORAGE_KEY = 'shiftcare.locale'

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value)
}

function initialLanguage(): UiLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isUiLanguage(stored)) return stored
  } catch {
    /* ignore */
  }
  const browser = navigator.language.slice(0, 2)
  return isUiLanguage(browser) ? browser : 'de'
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de } },
  lng: 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export async function changeLanguage(lng: UiLanguage) {
  if (lng !== 'de' && !i18n.hasResourceBundle(lng, 'translation')) {
    const mod = await loaders[lng]()
    i18n.addResourceBundle(lng, 'translation', mod.default, true, true)
  }
  await i18n.changeLanguage(lng)
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* ignore */
  }
}

void changeLanguage(initialLanguage())

export default i18n
