import type { ISODate } from '../types'
import type { ColumnMapping, ColumnRole, DateFormat, ImportLayout, ParseProblem, RawTable, StagingRow } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number): ISODate | null => {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** Excel serial day (1900 date system) → ISO date. */
export function excelSerialToDate(serial: number): ISODate | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 120000) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Dates as they appear in roster exports: 01.11.2026, 1.11.26, 2026-11-01,
 * 11/01/2026 (mdy), 01/11/2026 (dmy), "Mo, 02.11.2026", Excel serials.
 */
export function parseDate(value: string, format: DateFormat = 'dmy'): ISODate | null {
  const v = value.trim().replace(/^[A-Za-zÄÖÜäöü.]{2,4},?\s+/, '')
  if (!v) return null
  if (/^\d{5}(\.\d+)?$/.test(v)) return excelSerialToDate(Number(v))
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(v)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(v)
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (format === 'mdy') return iso(year, a, b)
    if (format === 'ymd') return null
    return iso(year, b, a)
  }
  m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(v)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** Times: 6:00, 06:00:00, 0600, 6.00, "6:00 Uhr", 6:00 PM, Excel day fractions (0.25). */
export function parseTime(value: string): string | null {
  let v = value.trim().toLowerCase().replace(/\s*uhr$/, '').replace(/\s+/g, ' ')
  if (!v) return null
  if (/^0?\.\d+$/.test(v) || v === '0') {
    const minutes = Math.round(Number(v) * 24 * 60)
    return minutes >= 0 && minutes < 1440 ? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` : null
  }
  const pm = / ?pm$/.test(v)
  const am = / ?am$/.test(v)
  v = v.replace(/ ?(am|pm)$/, '')
  let m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(v) ?? /^(\d{2})(\d{2})$/.exec(v) ?? /^(\d{1,2})$/.exec(v)
  if (!m) {
    // ISO date-time from some exports
    m = /T(\d{2}):(\d{2})/.exec(v)
    if (!m) return null
  }
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  if (h === 24 && min === 0) h = 0
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}

/** Break in minutes: 30, "30 min", 0:45, 0,75 h. */
export function parseBreak(value: string): number | null {
  const v = value.trim().toLowerCase().replace(',', '.')
  if (!v) return null
  let m = /^(\d+):(\d{2})$/.exec(v)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(\d+(?:\.\d+)?)\s*h$/.exec(v)
  if (m) return Math.round(Number(m[1]) * 60)
  m = /^(\d+)\s*(?:min|m)?$/.exec(v)
  return m ? Number(m[1]) : null
}

// ---------------------------------------------------------------- columns ----
const HEADER_HINTS: Record<ColumnRole, RegExp> = {
  employeeId: /^(personal\s?-?n(umme)?r\.?|pers\.?\s?-?nr\.?|pnr|mitarbeiter-?(id|nr|nummer)|ma-?nr\.?|employee\s?(id|number|no)|staff\s?(id|no)|id)$/,
  employeeName: /^(name|mitarbeiter(in)?|mitarbeitende[r]?|person|employee|staff|name,?\s?vorname|nachname,?\s?vorname)$/,
  firstName: /^(vorname|first\s?name|given\s?name)$/,
  lastName: /^(nachname|familienname|last\s?name|surname|family\s?name)$/,
  date: /^(datum|tag|dienstdatum|date|day)$/,
  start: /^(beginn|von|start|anfang|dienstbeginn|kommt|from|start\s?time)$/,
  end: /^(ende|bis|end|dienstende|geht|to|end\s?time)$/,
  code: /^(dienst|dienstart|diensttyp|schicht|kürzel|kuerzel|dienstkürzel|dienstkuerzel|code|shift|shift\s?code|shift\s?type)$/,
  break: /^(pause|pausen?zeit|pause\s?\(min\)|break|break\s?\(min\))$/,
  externalShiftId: /^(dienst-?id|schicht-?id|shift\s?id|eintrag-?id|entry\s?id)$/,
}

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/[:*]$/, '')

/** A header that stands for a day of the period: "1", "01.", "Mo 01", "01.11.", "2026-11-01". */
export function headerDay(header: string, periodStart: ISODate, format: DateFormat = 'dmy'): ISODate | null {
  const h = header.trim().replace(/^[A-Za-zÄÖÜäöü]{2,3}\.?,?\s*/, '').replace(/\s*[A-Za-zÄÖÜäöü]{2,3}\.?$/, '')
  const full = parseDate(h, format)
  if (full) return full
  const year = Number(periodStart.slice(0, 4))
  const month = Number(periodStart.slice(5, 7))
  let m = /^(\d{1,2})\.?$/.exec(h)
  if (m) return iso(year, month, Number(m[1]))
  m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(h)
  if (m) {
    const mm = Number(m[2])
    return iso(mm < month - 6 ? year + 1 : year, mm, Number(m[1]))
  }
  return null
}

export function detectLayout(table: RawTable, periodStart: ISODate): ImportLayout {
  const dayHeaders = table.headers.filter((h) => headerDay(h, periodStart)).length
  return dayHeaders >= 7 ? 'grid' : 'list'
}

/** Best guess for the column mapping; the user confirms or corrects it. */
export function suggestMapping(table: RawTable, layout: ImportLayout, periodStart: ISODate, format: DateFormat = 'dmy'): ColumnMapping {
  const roles: Partial<Record<ColumnRole, number>> = {}
  table.headers.forEach((h, i) => {
    const n = normHeader(h)
    for (const [role, re] of Object.entries(HEADER_HINTS) as [ColumnRole, RegExp][]) {
      if (roles[role] === undefined && re.test(n)) {
        roles[role] = i
        break
      }
    }
  })
  if (layout === 'list') return { roles }
  const dayColumns: Record<number, ISODate> = {}
  table.headers.forEach((h, i) => {
    const d = headerDay(h, periodStart, format)
    if (d && !Object.values(roles).includes(i)) dayColumns[i] = d
  })
  return { roles: { employeeId: roles.employeeId, employeeName: roles.employeeName, firstName: roles.firstName, lastName: roles.lastName }, dayColumns }
}

// ------------------------------------------------------------ normalise ----
export const MAX_IMPORT_ROWS = 10000

const cell = (row: string[], index: number | undefined) => (index === undefined ? '' : (row[index] ?? '').trim())

function person(row: string[], roles: ColumnMapping['roles']) {
  const ref = cell(row, roles.employeeId) || null
  const name =
    cell(row, roles.employeeName) ||
    [cell(row, roles.lastName), cell(row, roles.firstName)].filter(Boolean).join(', ') ||
    null
  return { ref, name }
}

/**
 * Converts a raw table into staging rows for stage_import(). Only parsing
 * happens here; employees and shift codes are resolved – and everything is
 * validated again – on the server.
 */
export function toStagingRows(
  table: RawTable,
  layout: ImportLayout,
  mapping: ColumnMapping,
  options: { dateFormat?: DateFormat } = {},
): { rows: StagingRow[]; problems: ParseProblem[] } {
  const rows: StagingRow[] = []
  const problems: ParseProblem[] = []
  const format = options.dateFormat ?? 'dmy'
  const { roles } = mapping
  const rawOf = (row: string[]) => Object.fromEntries(table.headers.map((h, i) => [h || `#${i + 1}`, row[i] ?? '']).filter(([, v]) => v !== ''))

  table.rows.forEach((row, index) => {
    const line = table.lines[index] ?? index + 2
    const who = person(row, roles)
    if (!who.ref && !who.name) {
      problems.push({ line, code: 'no_employee' })
      return
    }

    if (layout === 'grid') {
      for (const [col, date] of Object.entries(mapping.dayColumns ?? {})) {
        const code = cell(row, Number(col))
        rows.push({
          row_no: rows.length + 1,
          employee_ref: who.ref,
          employee_label: who.name,
          date,
          start: null,
          end: null,
          code: code || null,
          break_minutes: null,
          external_shift_id: null,
          raw: { line: String(line), [table.headers[Number(col)] || date]: code },
        })
      }
      return
    }

    const dateText = cell(row, roles.date)
    const date = parseDate(dateText, format)
    if (dateText && !date) problems.push({ line, code: 'invalid_date', value: dateText })
    const startText = cell(row, roles.start)
    const endText = cell(row, roles.end)
    const start = parseTime(startText)
    const end = parseTime(endText)
    if (startText && !start) problems.push({ line, code: 'invalid_time', value: startText })
    if (endText && !end) problems.push({ line, code: 'invalid_time', value: endText })
    const breakText = cell(row, roles.break)
    const breakMinutes = parseBreak(breakText)
    if (breakText && breakMinutes === null) problems.push({ line, code: 'invalid_break', value: breakText })
    rows.push({
      row_no: rows.length + 1,
      employee_ref: who.ref,
      employee_label: who.name,
      date,
      start: start && end ? start : null,
      end: start && end ? end : null,
      code: cell(row, roles.code) || null,
      break_minutes: breakMinutes,
      external_shift_id: cell(row, roles.externalShiftId) || null,
      raw: { line: String(line), ...rawOf(row) },
    })
  })

  if (rows.length > MAX_IMPORT_ROWS) {
    problems.push({ line: 0, code: 'too_many_rows', value: String(rows.length) })
    return { rows: rows.slice(0, MAX_IMPORT_ROWS), problems }
  }
  return { rows, problems }
}

/** First and last day covered by the rows (to propose the import period). */
export function dateRange(rows: StagingRow[]): { from: ISODate; to: ISODate } | null {
  const dates = rows.map((r) => r.date).filter((d): d is ISODate => !!d).sort()
  return dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null
}
