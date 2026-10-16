import type { ColumnMapping, DateFormat, ImportLayout, StagingRow } from '@/domain/integration/types'
import type { ISODate } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'

export type IntegrationKind = 'file' | 'api' | 'sftp'
export type ImportRunStatus = 'staged' | 'applied' | 'published' | 'failed' | 'cancelled' | 'superseded'
export type ImportRowStatus = 'ok' | 'warning' | 'error' | 'ignored'

export interface IntegrationSource {
  id: string
  unitId: string | null
  name: string
  kind: IntegrationKind
  vendor: string | null
  settings: { date_format?: DateFormat; layout?: ImportLayout; employee_key?: string }
  isActive: boolean
}

export interface ImportSummary {
  total?: number
  ok?: number
  warnings?: number
  errors?: number
  ignored?: number
  unmatched_employees?: number
  unknown_codes?: number
  diff?: { added: number; changed: number; removed: number; unchanged: number }
}

export interface ImportRun {
  id: string
  sourceId: string
  unitId: string
  periodStart: ISODate
  periodEnd: ISODate
  status: ImportRunStatus
  fileName: string | null
  layout: ImportLayout
  columnMapping: { layout?: ImportLayout; mapping?: ColumnMapping; dateFormat?: DateFormat; headers?: string[] }
  summary: ImportSummary
  errorMessage: string | null
  duplicateOf: string | null
  scheduleId: string | null
  createdAt: Date
}

export interface ImportMessage {
  code: string
  params: Record<string, string>
}

export interface ImportRow {
  id: string
  rowNo: number
  externalEmployeeId: string | null
  employeeLabel: string | null
  date: ISODate | null
  startTime: string | null
  endTime: string | null
  externalCode: string | null
  employeeId: string | null
  employeeMatch: 'mapping' | 'personnel_number' | null
  target: 'shift' | 'off' | 'ignore' | null
  shiftTypeId: string | null
  startsAt: Date | null
  endsAt: Date | null
  status: ImportRowStatus
  messages: ImportMessage[]
  line: string | null
}

export interface ImportChange {
  change: 'added' | 'changed' | 'removed'
  employeeId: string | null
  date: ISODate
  old: { kind: string; code: string | null; startsAt: Date | null; endsAt: Date | null } | null
  new: { kind: string; code: string | null; startsAt: Date | null; endsAt: Date | null } | null
  manual: boolean
}

export interface ImportPreview {
  schedule: { id: string; status: 'draft' | 'published'; version: number } | null
  counts: { added: number; changed: number; removed: number; unchanged: number; manual: number }
  changes: ImportChange[]
}

export interface ImportHistoryItem {
  id: string
  status: ImportRunStatus
  unitId: string
  unitName: string
  sourceName: string
  periodStart: ISODate
  periodEnd: ISODate
  fileName: string | null
  summary: ImportSummary
  errorMessage: string | null
  duplicateOf: string | null
  scheduleId: string | null
  createdAt: Date
  appliedAt: Date | null
  publishedAt: Date | null
  createdByName: string
  appliedByName: string | null
}

export interface EmployeeMapping {
  id: string
  externalId: string
  employeeId: string
  confirmedAt: Date
}

export interface CodeMapping {
  id: string
  unitId: string | null
  externalCode: string
  target: 'shift' | 'off' | 'ignore'
  shiftTypeId: string | null
}

interface RunRow {
  id: string
  source_id: string
  unit_id: string
  period_start: string
  period_end: string
  status: ImportRunStatus
  file_name: string | null
  layout: ImportLayout
  column_mapping: ImportRun['columnMapping']
  summary: ImportSummary
  error_message: string | null
  duplicate_of: string | null
  schedule_id: string | null
  created_at: string
}

const RUN_COLUMNS = 'id, source_id, unit_id, period_start, period_end, status, file_name, layout, column_mapping, summary, error_message, duplicate_of, schedule_id, created_at'
const toDate = (v: string | null | undefined) => (v ? new Date(v) : null)

const mapRun = (r: RunRow): ImportRun => ({
  id: r.id,
  sourceId: r.source_id,
  unitId: r.unit_id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  status: r.status,
  fileName: r.file_name,
  layout: r.layout,
  columnMapping: r.column_mapping ?? {},
  summary: r.summary ?? {},
  errorMessage: r.error_message,
  duplicateOf: r.duplicate_of,
  scheduleId: r.schedule_id,
  createdAt: new Date(r.created_at),
})

export type ApiKey = { id: string; label: string | null; prefix: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }

export const integrationRepository = {
  /** Keys of a "Dienstwerk-Schnittstelle" profile; the hash is never readable. */
  async listApiKeys(sourceId: string): Promise<ApiKey[]> {
    const rows = unwrapList<{ id: string; label: string | null; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>(
      await db().from('integration_api_keys').select('id, label, key_prefix, created_at, last_used_at, revoked_at').eq('source_id', sourceId).order('created_at', { ascending: false }),
    )
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      prefix: r.key_prefix,
      createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
      revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
    }))
  },

  /** Returns the plain key – shown once, never stored in readable form. */
  async createApiKey(sourceId: string, label: string): Promise<{ id: string; key: string }> {
    return unwrap<{ id: string; key: string }>(await db().rpc('create_integration_api_key', { p_source_id: sourceId, p_label: label || null }))
  },

  async revokeApiKey(keyId: string) {
    unwrap(await db().rpc('revoke_integration_api_key', { p_key_id: keyId }))
  },

  async fetchSources(hospitalId: string): Promise<IntegrationSource[]> {
    const rows = unwrapList<{ id: string; unit_id: string | null; name: string; kind: IntegrationKind; vendor: string | null; settings: IntegrationSource['settings']; is_active: boolean }>(
      await db().from('integration_sources').select('id, unit_id, name, kind, vendor, settings, is_active').eq('hospital_id', hospitalId).order('name'),
    )
    return rows.map((r) => ({ id: r.id, unitId: r.unit_id, name: r.name, kind: r.kind, vendor: r.vendor, settings: r.settings ?? {}, isActive: r.is_active }))
  },

  async saveSource(hospitalId: string, s: { id?: string; unitId: string | null; name: string; kind: IntegrationKind; vendor: string | null; settings: IntegrationSource['settings']; isActive: boolean }) {
    const values = { unit_id: s.unitId, name: s.name.trim(), kind: s.kind, vendor: s.vendor?.trim() || null, settings: s.settings, is_active: s.isActive }
    unwrap(s.id ? await db().from('integration_sources').update(values).eq('id', s.id) : await db().from('integration_sources').insert({ hospital_id: hospitalId, ...values }))
  },

  async setSecret(sourceId: string, secret: string) {
    unwrap(await db().rpc('set_integration_secret', { p_source_id: sourceId, p_secret: secret }))
  },

  async hasSecret(sourceId: string): Promise<boolean> {
    return !!unwrap<boolean | null>(await db().rpc('integration_source_has_secret', { p_source_id: sourceId }))
  },

  async stage(input: {
    sourceId: string
    unitId: string
    periodStart: ISODate
    periodEnd: ISODate
    fileName: string
    fileSha256: string
    layout: ImportLayout
    mapping: ImportRun['columnMapping']
    rows: StagingRow[]
  }): Promise<ImportRun> {
    return mapRun(
      unwrap<RunRow>(
        await db().rpc('stage_import', {
          p_source_id: input.sourceId,
          p_unit_id: input.unitId,
          p_period_start: input.periodStart,
          p_period_end: input.periodEnd,
          p_file_name: input.fileName,
          p_file_sha256: input.fileSha256,
          p_layout: input.layout,
          p_mapping: input.mapping,
          p_rows: input.rows,
        }),
      ),
    )
  },

  async fetchRun(runId: string): Promise<ImportRun> {
    return mapRun(unwrap<RunRow>(await db().from('import_runs').select(RUN_COLUMNS).eq('id', runId).single()))
  },

  /** Mapping of the latest import of this profile and ward – proposed again for the next file. */
  async lastMapping(sourceId: string, unitId: string): Promise<ImportRun['columnMapping'] | null> {
    const rows = unwrapList<{ column_mapping: ImportRun['columnMapping'] }>(
      await db()
        .from('import_runs')
        .select('column_mapping')
        .eq('source_id', sourceId)
        .eq('unit_id', unitId)
        .in('status', ['applied', 'published'])
        .order('created_at', { ascending: false })
        .limit(1),
    )
    return rows[0]?.column_mapping ?? null
  },

  async fetchRows(runId: string): Promise<ImportRow[]> {
    const rows = unwrapList<{
      id: string
      row_no: number
      external_employee_id: string | null
      employee_label: string | null
      entry_date: string | null
      start_time: string | null
      end_time: string | null
      external_code: string | null
      employee_id: string | null
      employee_match: ImportRow['employeeMatch']
      target: ImportRow['target']
      shift_type_id: string | null
      starts_at: string | null
      ends_at: string | null
      status: ImportRowStatus
      messages: ImportMessage[]
      raw: Record<string, string> | null
    }>(
      await db()
        .from('import_rows')
        .select('id, row_no, external_employee_id, employee_label, entry_date, start_time, end_time, external_code, employee_id, employee_match, target, shift_type_id, starts_at, ends_at, status, messages, raw')
        .eq('run_id', runId)
        .order('row_no')
        .limit(10000),
    )
    return rows.map((r) => ({
      id: r.id,
      rowNo: r.row_no,
      externalEmployeeId: r.external_employee_id,
      employeeLabel: r.employee_label,
      date: r.entry_date,
      startTime: r.start_time?.slice(0, 5) ?? null,
      endTime: r.end_time?.slice(0, 5) ?? null,
      externalCode: r.external_code,
      employeeId: r.employee_id,
      employeeMatch: r.employee_match,
      target: r.target,
      shiftTypeId: r.shift_type_id,
      startsAt: toDate(r.starts_at),
      endsAt: toDate(r.ends_at),
      status: r.status,
      messages: r.messages ?? [],
      line: r.raw?.line ?? null,
    }))
  },

  async revalidate(runId: string): Promise<ImportRun> {
    return mapRun(unwrap<RunRow>(await db().rpc('revalidate_import', { p_run_id: runId })))
  },

  async cancel(runId: string) {
    unwrap(await db().rpc('cancel_import', { p_run_id: runId }))
  },

  async confirmEmployee(sourceId: string, externalId: string, employeeId: string) {
    unwrap(await db().rpc('confirm_employee_mapping', { p_source_id: sourceId, p_external_id: externalId, p_employee_id: employeeId }))
  },

  async mapCode(sourceId: string, unitId: string | null, code: string, target: 'shift' | 'off' | 'ignore', shiftTypeId: string | null) {
    unwrap(await db().rpc('map_shift_code', { p_source_id: sourceId, p_unit_id: unitId, p_code: code, p_target: target, p_shift_type_id: shiftTypeId }))
  },

  async preview(runId: string): Promise<ImportPreview> {
    const p = unwrap<{
      schedule: ImportPreview['schedule']
      counts: ImportPreview['counts']
      changes: { change: ImportChange['change']; employee_id: string | null; date: string; old: RawSide | null; new: RawSide | null; manual: boolean }[]
    }>(await db().rpc('preview_import', { p_run_id: runId }))
    const side = (x: RawSide | null) => (x ? { kind: x.kind, code: x.code, startsAt: toDate(x.starts_at), endsAt: toDate(x.ends_at) } : null)
    return {
      schedule: p.schedule,
      counts: p.counts,
      changes: p.changes.map((c) => ({ change: c.change, employeeId: c.employee_id, date: c.date, old: side(c.old), new: side(c.new), manual: c.manual })),
    }
  },

  async apply(runId: string): Promise<ImportRun> {
    return mapRun(unwrap<RunRow>(await db().rpc('apply_import', { p_run_id: runId })))
  },

  async history(hospitalId: string, limit = 50): Promise<ImportHistoryItem[]> {
    const rows = unwrap<
      {
        id: string
        status: ImportRunStatus
        unit_id: string
        unit_name: string
        source_name: string
        period_start: string
        period_end: string
        file_name: string | null
        summary: ImportSummary
        error_message: string | null
        duplicate_of: string | null
        schedule_id: string | null
        created_at: string
        applied_at: string | null
        published_at: string | null
        created_by_name: string
        applied_by_name: string | null
      }[]
    >(await db().rpc('list_import_runs', { p_hospital_id: hospitalId, p_limit: limit }))
    return (rows ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      unitId: r.unit_id,
      unitName: r.unit_name,
      sourceName: r.source_name,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      fileName: r.file_name,
      summary: r.summary ?? {},
      errorMessage: r.error_message,
      duplicateOf: r.duplicate_of,
      scheduleId: r.schedule_id,
      createdAt: new Date(r.created_at),
      appliedAt: toDate(r.applied_at),
      publishedAt: toDate(r.published_at),
      createdByName: r.created_by_name,
      appliedByName: r.applied_by_name,
    }))
  },

  async fetchEmployeeMappings(sourceId: string): Promise<EmployeeMapping[]> {
    const rows = unwrapList<{ id: string; external_id: string; employee_id: string; confirmed_at: string }>(
      await db().from('employee_external_ids').select('id, external_id, employee_id, confirmed_at').eq('source_id', sourceId).order('external_id'),
    )
    return rows.map((r) => ({ id: r.id, externalId: r.external_id, employeeId: r.employee_id, confirmedAt: new Date(r.confirmed_at) }))
  },

  async removeEmployeeMapping(id: string) {
    unwrap(await db().rpc('remove_employee_mapping', { p_mapping_id: id }))
  },

  async fetchCodeMappings(sourceId: string): Promise<CodeMapping[]> {
    const rows = unwrapList<{ id: string; unit_id: string | null; external_code: string; target: CodeMapping['target']; shift_type_id: string | null }>(
      await db().from('shift_code_mappings').select('id, unit_id, external_code, target, shift_type_id').eq('source_id', sourceId).order('external_code'),
    )
    return rows.map((r) => ({ id: r.id, unitId: r.unit_id, externalCode: r.external_code, target: r.target, shiftTypeId: r.shift_type_id }))
  },
}

interface RawSide {
  kind: string
  code: string | null
  starts_at: string | null
  ends_at: string | null
}
