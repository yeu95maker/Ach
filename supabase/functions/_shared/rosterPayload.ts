/**
 * Pulshift Roster Exchange v1 – validation of a delivery to `roster-sync`.
 * Pure TypeScript (no Deno/Node APIs) so it runs in the Edge Function and in
 * the unit tests. The database validates again; this gives senders precise,
 * early error messages.
 */

export type RosterShift = {
  employee: string
  date: string
  code?: string
  start?: string
  end?: string
  break_minutes?: number
  id?: string
  name?: string
}

export type RosterPayload = {
  unit: string
  period: { start: string; end: string }
  source_version?: string
  shifts: RosterShift[]
}

export type ValidationResult = { ok: true; payload: RosterPayload } | { ok: false; errors: string[] }

export const MAX_SHIFTS = 10_000
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export function validateRosterPayload(input: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['body must be a JSON object'] }
  const p = input as Record<string, unknown>

  if (!str(p.unit, 32)) errors.push('unit: ward code (1–32 characters) required')
  const period = p.period as Record<string, unknown> | undefined
  if (!period || !isDate(period.start) || !isDate(period.end)) {
    errors.push('period.start / period.end: dates in the format YYYY-MM-DD required')
  } else {
    const days = (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86_400_000
    if (days < 0 || days > 62) errors.push('period: end must be on or after start, at most 63 days')
  }
  if (p.source_version !== undefined && typeof p.source_version !== 'string') errors.push('source_version: string expected')

  if (!Array.isArray(p.shifts)) {
    errors.push('shifts: array required (may be empty to clear the period)')
  } else if (p.shifts.length > MAX_SHIFTS) {
    errors.push(`shifts: at most ${MAX_SHIFTS} entries`)
  } else {
    p.shifts.forEach((s, i) => {
      if (errors.length >= 20) return
      const at = `shifts[${i}]`
      if (typeof s !== 'object' || s === null) return void errors.push(`${at}: object expected`)
      const x = s as Record<string, unknown>
      if (!str(x.employee, 64)) errors.push(`${at}.employee: personnel number / ID required`)
      if (!isDate(x.date)) errors.push(`${at}.date: YYYY-MM-DD required`)
      if (x.code !== undefined && !str(x.code, 32)) errors.push(`${at}.code: 1–32 characters`)
      for (const k of ['start', 'end'] as const) if (x[k] !== undefined && !(typeof x[k] === 'string' && TIME.test(x[k] as string))) errors.push(`${at}.${k}: HH:MM`)
      if ((x.start === undefined) !== (x.end === undefined)) errors.push(`${at}: start and end only together`)
      if (x.code === undefined && x.start === undefined) errors.push(`${at}: code or start/end required`)
      if (x.break_minutes !== undefined && !(Number.isInteger(x.break_minutes) && (x.break_minutes as number) >= 0 && (x.break_minutes as number) <= 600)) errors.push(`${at}.break_minutes: 0–600`)
      if (x.id !== undefined && !str(x.id, 128)) errors.push(`${at}.id: 1–128 characters`)
      if (x.name !== undefined && typeof x.name !== 'string') errors.push(`${at}.name: string`)
    })
  }
  return errors.length ? { ok: false, errors } : { ok: true, payload: p as unknown as RosterPayload }
}

/** Bearer token or X-Pulshift-Key header. */
export function readApiKey(headers: { get(name: string): string | null }): string | null {
  const auth = headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null
  return headers.get('x-pulshift-key')?.trim() || null
}
