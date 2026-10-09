import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { ISODate } from './types'

export const WEEK_STARTS_ON = 1 as const // Monday (DIN 1355 / ISO 8601)

/** Date → `YYYY-MM-DD` using the *local* calendar day. */
export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

/** `YYYY-MM-DD` → local midnight. */
export function fromISODate(value: ISODate): Date {
  return parseISO(value)
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(value), days))
}

/** The calendar day of `instant` in the given IANA time zone. */
export function isoDateInTimeZone(instant: Date, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end
}

export function daysBetweenInclusive(start: ISODate, end: ISODate): number {
  return differenceInCalendarDays(fromISODate(end), fromISODate(start)) + 1
}

/** Mon–Fri days in the range. Public holidays are not considered yet (see docs/OPEN_POINTS.md). */
export function countWorkdays(start: ISODate, end: ISODate): number {
  if (end < start) return 0
  return eachDayOfInterval({ start: fromISODate(start), end: fromISODate(end) }).filter((d) => !isWeekend(d)).length
}

/** All days of the visible month grid (full weeks, Monday first). */
export function monthGrid(anchor: Date): ISODate[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON })
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON })
  return eachDayOfInterval({ start, end }).map(toISODate)
}

export function weekDays(anchor: Date): ISODate[] {
  const start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON })
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)))
}

export function isSameMonth(date: ISODate, anchor: Date): boolean {
  return date.slice(0, 7) === toISODate(anchor).slice(0, 7)
}
