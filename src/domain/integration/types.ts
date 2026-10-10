import type { ISODate } from '../types'

/**
 * A table as read from a source file (CSV, one XLSX sheet …) or – later – an
 * API response converted to rows. Cells are always strings; meaning is only
 * given by the column mapping.
 */
export interface RawTable {
  name: string
  headers: string[]
  rows: string[][]
  /** 1-based line/row number of each data row in the original file */
  lines: number[]
}

/** "list": one row per shift. "grid": one row per person, one column per day. */
export type ImportLayout = 'list' | 'grid'

export type ColumnRole =
  | 'employeeId'
  | 'employeeName'
  | 'firstName'
  | 'lastName'
  | 'date'
  | 'start'
  | 'end'
  | 'code'
  | 'break'
  | 'externalShiftId'

/** Column index per role (list layout) or the people columns + day columns (grid layout). */
export interface ColumnMapping {
  roles: Partial<Record<ColumnRole, number>>
  /** grid only: column index → calendar day */
  dayColumns?: Record<number, ISODate>
}

export type DateFormat = 'dmy' | 'ymd' | 'mdy'

/** One normalised row as sent to stage_import() – the server resolves and validates it. */
export interface StagingRow {
  row_no: number
  employee_ref: string | null
  employee_label: string | null
  date: ISODate | null
  start: string | null
  end: string | null
  code: string | null
  break_minutes: number | null
  external_shift_id: string | null
  raw: Record<string, string>
}

export type ParseProblemCode = 'invalid_date' | 'invalid_time' | 'invalid_break' | 'no_employee' | 'too_many_rows'

export interface ParseProblem {
  /** 1-based line in the file (header = 1) */
  line: number
  code: ParseProblemCode
  value?: string
}
