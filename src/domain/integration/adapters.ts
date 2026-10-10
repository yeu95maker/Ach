import { decodeText, detectDelimiter, parseCsv, toTable } from './csv'
import type { RawTable } from './types'
import { readXlsx } from './xlsx'

/**
 * A source-system adapter turns what a source system provides into RawTables.
 * Everything after that – column mapping, normalisation, employee and code
 * resolution, validation, diff, apply and publish – is shared by all
 * adapters (normalize.ts in the browser, stage_import()/apply_import() in the
 * database).
 *
 * File adapters run in the browser: the file never leaves the device, only
 * the normalised rows are sent. Adapters for direct vendor APIs will run on
 * the server (Edge Function) because they need credentials from Vault; they
 * implement `testConnection` and `fetchTables` and are NOT implemented yet.
 */
export interface SourceAdapter {
  id: string
  /** i18n key */
  labelKey: string
  kind: 'file' | 'api'
  accepts?: (fileName: string, mimeType: string) => boolean
  readFile?: (bytes: Uint8Array, fileName: string) => RawTable[]
  testConnection?: () => Promise<{ ok: boolean; message?: string }>
  fetchTables?: (period: { from: string; to: string }) => Promise<RawTable[]>
}

export const csvAdapter: SourceAdapter = {
  id: 'csv',
  labelKey: 'integration.adapter.csv',
  kind: 'file',
  accepts: (name, type) => /\.(csv|txt|tsv)$/i.test(name) || type === 'text/csv',
  readFile: (bytes, name) => {
    const text = decodeText(bytes)
    return [toTable(name, parseCsv(text, detectDelimiter(text)))]
  },
}

export const xlsxAdapter: SourceAdapter = {
  id: 'xlsx',
  labelKey: 'integration.adapter.xlsx',
  kind: 'file',
  accepts: (name, type) => /\.xlsx$/i.test(name) || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  readFile: (bytes) => readXlsx(bytes),
}

/** Implemented adapters. Vendor API adapters are added here once they exist and are tested. */
export const ADAPTERS: readonly SourceAdapter[] = [csvAdapter, xlsxAdapter]

export function adapterForFile(fileName: string, mimeType: string): SourceAdapter | null {
  return ADAPTERS.find((a) => a.kind === 'file' && a.accepts?.(fileName, mimeType)) ?? null
}

/** SHA-256 of the file – lets the server recognise the same upload twice. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
