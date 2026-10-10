import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ISODate } from '@/domain/types'

const LOCALE_TAGS: Record<string, string> = { de: 'de-DE', en: 'en-GB', tr: 'tr-TR', ro: 'ro-RO', pl: 'pl-PL' }

/** A calendar date rendered without any time-zone shift. */
function isoToUtcDate(value: ISODate) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12))
}

export function createFormatter(language: string, timeZone: string) {
  const locale = LOCALE_TAGS[language] ?? language
  const cache = new Map<string, Intl.DateTimeFormat>()
  const dtf = (key: string, options: Intl.DateTimeFormatOptions, tz: string) => {
    const k = `${key}|${tz}`
    let f = cache.get(k)
    if (!f) {
      f = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz })
      cache.set(k, f)
    }
    return f
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  return {
    locale,
    /** 06:00 – shift times are shown in the hospital's time zone. */
    time: (d: Date) => dtf('time', { hour: '2-digit', minute: '2-digit' }, timeZone).format(d),
    timeRange: (a: Date, b: Date) => `${dtf('time', { hour: '2-digit', minute: '2-digit' }, timeZone).format(a)} – ${dtf('time', { hour: '2-digit', minute: '2-digit' }, timeZone).format(b)}`,
    /** Mo., 12. Okt. */
    dateShort: (v: ISODate) => dtf('ds', { weekday: 'short', day: 'numeric', month: 'short' }, 'UTC').format(isoToUtcDate(v)),
    /** Montag, 12. Oktober 2026 */
    dateLong: (v: ISODate) => dtf('dl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, 'UTC').format(isoToUtcDate(v)),
    /** 12. Okt. 2026 */
    date: (v: ISODate) => dtf('d', { day: 'numeric', month: 'short', year: 'numeric' }, 'UTC').format(isoToUtcDate(v)),
    dayNumber: (v: ISODate) => dtf('dn', { day: 'numeric' }, 'UTC').format(isoToUtcDate(v)),
    weekdayShort: (v: ISODate) => dtf('wd', { weekday: 'short' }, 'UTC').format(isoToUtcDate(v)),
    weekdayNarrow: (v: ISODate) => dtf('wn', { weekday: 'narrow' }, 'UTC').format(isoToUtcDate(v)),
    monthYear: (v: ISODate) => dtf('my', { month: 'long', year: 'numeric' }, 'UTC').format(isoToUtcDate(v)),
    dateRange: (a: ISODate, b: ISODate) => {
      const f = dtf('dr', { day: 'numeric', month: 'short', year: 'numeric' }, 'UTC')
      return a === b ? f.format(isoToUtcDate(a)) : f.formatRange(isoToUtcDate(a), isoToUtcDate(b))
    },
    /** Do., 15. Okt. · 13:00 – 13:45 (instants, hospital time zone) */
    eventTime: (start: Date, end: Date | null) => {
      const day = dtf('ev', { weekday: 'short', day: 'numeric', month: 'short' }, timeZone).format(start)
      const t = dtf('time', { hour: '2-digit', minute: '2-digit' }, timeZone)
      return end ? `${day} · ${t.format(start)} – ${t.format(end)}` : `${day} · ${t.format(start)}`
    },
    relative: (d: Date, now = new Date()) => {
      const diff = (d.getTime() - now.getTime()) / 1000
      const abs = Math.abs(diff)
      if (abs < 60) return rtf.format(Math.round(diff), 'second')
      if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
      if (abs < 604800) return rtf.format(Math.round(diff / 86400), 'day')
      return dtf('rel', { day: 'numeric', month: 'short' }, timeZone).format(d)
    },
    hours: (minutes: number) => {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return m ? `${h}:${String(m).padStart(2, '0')} h` : `${h} h`
    },
  }
}

export type Formatter = ReturnType<typeof createFormatter>

export function useFormatter(timeZone = 'Europe/Berlin'): Formatter {
  const { i18n } = useTranslation()
  return useMemo(() => createFormatter(i18n.language, timeZone), [i18n.language, timeZone])
}
