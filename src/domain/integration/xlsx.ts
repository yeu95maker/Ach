import { strFromU8, unzipSync } from 'fflate'
import { toTable } from './csv'
import type { RawTable } from './types'

/** Upper bound for the unpacked parts we read (protects the browser against zip bombs). */
const MAX_UNPACKED_BYTES = 40 * 1024 * 1024

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

/** Concatenated text of all <t> elements (rich text runs included). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join('')

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null

/** "BC12" → 54 (0-based column index). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  return [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

/**
 * Minimal, dependency-light reader for Office Open XML spreadsheets
 * (.xlsx from Excel, LibreOffice, most roster programs). Returns every
 * worksheet as a table of strings. Numbers stay as written (dates/times
 * as Excel serial numbers – the normaliser understands them).
 */
export function readXlsx(bytes: Uint8Array): RawTable[] {
  let unpacked = 0
  const files = unzipSync(bytes, {
    filter: (f) => {
      const wanted = f.name === 'xl/workbook.xml' || f.name === 'xl/sharedStrings.xml' || f.name === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)
      if (wanted) unpacked += f.originalSize
      if (unpacked > MAX_UNPACKED_BYTES) throw new Error('xlsx_too_large')
      return wanted
    },
  })
  const workbook = files['xl/workbook.xml']
  if (!workbook) throw new Error('xlsx_invalid')

  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!))
    : []

  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : ''
  const target = (rid: string) => {
    const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === rid)
    const t = rel ? attr(rel, 'Target') : null
    return t ? `xl/${t.replace(/^\/?xl\//, '').replace(/^\.\//, '')}` : null
  }

  const sheets = [...strFromU8(workbook).matchAll(/<sheet\s[^>]*>/g)].map((m) => m[0])
  return sheets
    .map((tag, i) => {
      const name = decodeXml(attr(tag, 'name') ?? `Sheet${i + 1}`)
      const path = target(attr(tag, 'r:id') ?? '') ?? `xl/worksheets/sheet${i + 1}.xml`
      const xml = files[path] ? strFromU8(files[path]) : ''
      const grid: string[][] = []
      for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const rowTag = rowMatch[0].slice(0, rowMatch[0].indexOf('>') + 1)
        const r = Number(attr(rowTag, 'r') ?? grid.length + 1) - 1
        const cells: string[] = []
        let next = 0
        for (const c of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = attr(c[0], 'r')
          const col = ref ? columnIndex(ref) : next
          next = col + 1
          const type = attr(c[0], 't')
          const inner = c[2] ?? ''
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          let value = ''
          if (type === 's') value = shared[Number(v)] ?? ''
          else if (type === 'inlineStr') value = textOf(inner)
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
          else if (v !== undefined) value = decodeXml(v)
          cells[col] = value
        }
        grid[r] = Array.from({ length: cells.length }, (_, k) => cells[k] ?? '')
      }
      return toTable(name, Array.from({ length: grid.length }, (_, k) => grid[k] ?? []))
    })
    .filter((t) => t.headers.some(Boolean))
}
