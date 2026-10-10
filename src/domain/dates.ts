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

/** Offset of `timeZone` from UTC at `instant`, in minutes (Berlin summer time: +120). */
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** Wall-clock date + time ("2026-10-12", "14:30") in `timeZone` → instant. */
export function zonedDateTime(date: ISODate, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wallAsUtc = Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0)
  // Two passes handle the day of a DST switch.
  let instant = wallAsUtc - timeZoneOffsetMinutes(new Date(wallAsUtc), timeZone) * 60000
  instant = wallAsUtc - timeZoneOffsetMinutes(new Date(instant), timeZone) * 60000
  return new Date(instant)
}
