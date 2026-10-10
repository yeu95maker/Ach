import type { RawTable } from './types'

/** UTF-8 (with or without BOM) or – typical for German Excel exports – Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** The delimiter that splits the first lines most consistently (; , tab |). */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best = ';'
  let bestScore = -1
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => splitLine(l, d).length)
    const first = counts[0] ?? 0
    if (first < 2) continue
    const consistent = counts.filter((c) => c === first).length
    const score = consistent * 100 + first
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

function splitLine(line: string, delimiter: string): string[] {
  return parseCsv(line, delimiter)[0] ?? []
}

/** RFC 4180: quoted fields, doubled quotes, delimiters and line breaks inside quotes. */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** First row with at least two filled cells is the header; fully empty rows are dropped. */
export function toTable(name: string, cells: string[][], lineOf: (index: number) => number = (i) => i + 1): RawTable {
  const headerIndex = Math.max(0, cells.findIndex((r) => r.filter((c) => c.trim()).length >= 2))
  const headers = (cells[headerIndex] ?? []).map((h) => h.trim())
  const body = cells.map((r, i) => ({ r, line: lineOf(i) })).slice(headerIndex + 1).filter(({ r }) => r.some((c) => c.trim() !== ''))
  const width = Math.max(headers.length, ...body.map(({ r }) => r.length))
  return {
    name,
    headers: Array.from({ length: width }, (_, i) => headers[i] ?? ''),
    rows: body.map(({ r }) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim())),
    lines: body.map(({ line }) => line),
  }
}
