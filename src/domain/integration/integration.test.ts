/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { adapterForFile, csvAdapter, sha256Hex, xlsxAdapter } from './adapters'
import { decodeText, detectDelimiter, parseCsv, toTable } from './csv'
import { dateRange, detectLayout, excelSerialToDate, headerDay, parseBreak, parseDate, parseTime, suggestMapping, toStagingRows } from './normalize'
import { columnIndex, readXlsx } from './xlsx'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)))
const NOV = '2026-11-01'

describe('dates and times', () => {
  it.each([
    ['02.11.2026', '2026-11-02'],
    ['2.11.26', '2026-11-02'],
    ['2026-11-02', '2026-11-02'],
    ['2026-11-02T00:00:00', '2026-11-02'],
    ['Mo, 02.11.2026', '2026-11-02'],
    ['02/11/2026', '2026-11-02'],
    ['46328', '2026-11-02'],
    ['31.11.2026', null],
    ['', null],
  ])('parseDate(%s) = %s', (input, out) => expect(parseDate(input)).toBe(out))

  it('understands US order when configured', () => {
    expect(parseDate('11/02/2026', 'mdy')).toBe('2026-11-02')
  })

  it.each([
    ['6:00', '06:00'],
    ['06:00:00', '06:00'],
    ['0600', '06:00'],
    ['21.45', '21:45'],
    ['6:15 Uhr', '06:15'],
    ['9:45 PM', '21:45'],
    ['12:30 AM', '00:30'],
    ['0.25', '06:00'],
    ['0.90625', '21:45'],
    ['24:00', '00:00'],
    ['25:00', null],
    ['abc', null],
  ])('parseTime(%s) = %s', (input, out) => expect(parseTime(input)).toBe(out))

  it.each([
    ['30', 30],
    ['45 min', 45],
    ['0:45', 45],
    ['0,75 h', 45],
    ['x', null],
  ])('parseBreak(%s) = %s', (input, out) => expect(parseBreak(input)).toBe(out))

  it('converts Excel serials', () => {
    expect(excelSerialToDate(45658)).toBe('2025-01-01')
    expect(excelSerialToDate(12)).toBeNull()
  })

  it('reads day headers of a grid', () => {
    expect(headerDay('01.', NOV)).toBe('2026-11-01')
    expect(headerDay('Mo 02', NOV)).toBe('2026-11-02')
    expect(headerDay('03.11.', NOV)).toBe('2026-11-03')
    expect(headerDay('2026-11-04', NOV)).toBe('2026-11-04')
    expect(headerDay('Name', NOV)).toBeNull()
  })
})

describe('CSV', () => {
  it('handles quotes, delimiters and line breaks inside quotes', () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;"zwei\nZeilen";3', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', 'zwei\nZeilen', '3'],
    ])
  })

  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(detectDelimiter('"Name, Vorname";Datum\n"Becker, Anna";02.11.2026')).toBe(';')
  })

  it('decodes UTF-8 with BOM and Windows-1252', () => {
    expect(decodeText(fixture('dienstliste.csv')).startsWith('Personalnummer')).toBe(true)
    expect(decodeText(fixture('roster-cp1252.csv'))).toContain('Müller-Schulz')
  })

  it('finds the header below title rows and keeps line numbers', () => {
    const t = toTable('x', [['Dienstplan November'], [], ['Pers.-Nr.', 'Name'], ['P-1', 'A'], [], ['P-2', 'B']])
    expect(t.headers).toEqual(['Pers.-Nr.', 'Name'])
    expect(t.rows).toEqual([['P-1', 'A'], ['P-2', 'B']])
    expect(t.lines).toEqual([4, 6])
  })
})

describe('XLSX', () => {
  it('reads list exports with date and time cells (openpyxl)', () => {
    const [sheet] = readXlsx(fixture('dienstliste.xlsx'))
    expect(sheet!.name).toBe('Dienstplan')
    expect(sheet!.headers).toEqual(['Personalnummer', 'Name', 'Datum', 'Dienst', 'Beginn', 'Ende', 'Pause'])
    expect(sheet!.rows).toHaveLength(5)
    expect(parseDate(sheet!.rows[0]![2]!)).toBe('2026-11-02')
    expect(parseTime(sheet!.rows[2]![5]!)).toBe('06:15')
    expect(sheet!.lines[0]).toBe(3) // title row + header row above
  })

  it('reads grids written by LibreOffice', () => {
    const [sheet] = readXlsx(fixture('raster-libreoffice.xlsx'))
    expect(sheet!.headers.slice(0, 3)).toEqual(['Personalnummer', 'Name', '1'])
    expect(sheet!.rows[0]!.slice(0, 4)).toEqual(['P-1001', 'Becker, Anna', 'F', 'F'])
  })

  it('reads inline strings, sparse cells and multiple sheets', () => {
    const sheet = (rows: string) =>
      strToU8(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`)
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="A &amp; B" sheetId="1" r:id="rId1"/><sheet name="Leer" sheetId="2" r:id="rId2"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c><c r="C1" t="inlineStr"><is><r><t>Dien</t></r><r><t>st</t></r></is></c></row>' +
          '<row r="2"><c r="A2"><v>17</v></c><c r="C2" t="inlineStr"><is><t>N</t></is></c></row>',
      ),
      'xl/worksheets/sheet2.xml': sheet(''),
    })
    const tables = readXlsx(bytes)
    expect(tables).toHaveLength(1)
    expect(tables[0]!.name).toBe('A & B')
    expect(tables[0]!.headers).toEqual(['ID', '', 'Dienst'])
    expect(tables[0]!.rows).toEqual([['17', '', 'N']])
  })

  it('rejects files that are not spreadsheets', () => {
    expect(() => readXlsx(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow('xlsx_invalid')
  })

  it('maps column letters', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AA1')).toBe(26)
    expect(columnIndex('BC12')).toBe(54)
  })
})

describe('adapters', () => {
  it('pick the adapter by file name', () => {
    expect(adapterForFile('plan.CSV', '')).toBe(csvAdapter)
    expect(adapterForFile('plan.xlsx', '')).toBe(xlsxAdapter)
    expect(adapterForFile('plan.pdf', 'application/pdf')).toBeNull()
  })

  it('hash files', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('mapping and normalisation', () => {
  it('suggests the columns of a German list export and normalises it (CSV)', () => {
    const [table] = csvAdapter.readFile!(fixture('dienstliste.csv'), 'dienstliste.csv')
    expect(detectLayout(table!, NOV)).toBe('list')
    const mapping = suggestMapping(table!, 'list', NOV)
    expect(mapping.roles).toEqual({ employeeId: 0, employeeName: 1, date: 2, code: 3, start: 4, end: 5, break: 6 })

    const { rows, problems } = toStagingRows(table!, 'list', mapping)
    expect(problems).toEqual([])
    expect(rows).toHaveLength(5)
    expect(rows[2]).toMatchObject({ employee_ref: 'P-1002', date: '2026-11-02', code: 'N', start: '21:45', end: '06:15', break_minutes: 45 })
    expect(rows[3]).toMatchObject({ code: 'FD', start: null, end: null })
    expect(rows[0]!.raw).toMatchObject({ line: '2', Name: 'Becker, Anna' })
    expect(dateRange(rows)).toEqual({ from: '2026-11-02', to: '2026-11-05' })
  })

  it('gives the same result for the XLSX version of the export', () => {
    const [csvTable] = csvAdapter.readFile!(fixture('dienstliste.csv'), 'a.csv')
    const [xlsxTable] = xlsxAdapter.readFile!(fixture('dienstliste.xlsx'), 'a.xlsx')
    const strip = (r: ReturnType<typeof toStagingRows>['rows']) => r.map(({ raw: _raw, ...rest }) => rest)
    const a = toStagingRows(csvTable!, 'list', suggestMapping(csvTable!, 'list', NOV)).rows
    const b = toStagingRows(xlsxTable!, 'list', suggestMapping(xlsxTable!, 'list', NOV)).rows
    expect(strip(b)).toEqual(strip(a))
  })

  it('combines first and last name and reads 12-hour times (Windows-1252 CSV)', () => {
    const [table] = csvAdapter.readFile!(fixture('roster-cp1252.csv'), 'r.csv')
    const mapping = suggestMapping(table!, 'list', NOV)
    expect(mapping.roles).toMatchObject({ employeeId: 0, lastName: 1, firstName: 2, date: 3, code: 4, start: 5, end: 6 })
    const { rows } = toStagingRows(table!, 'list', mapping)
    expect(rows[0]).toMatchObject({ employee_label: 'Müller-Schulz, Mira', date: '2026-11-02', start: '06:00' })
    expect(rows[1]).toMatchObject({ code: 'N', start: '21:45', end: '06:15' })
  })

  it('expands a grid into one row per person and day', () => {
    const [table] = xlsxAdapter.readFile!(fixture('dienstplan-raster.xlsx'), 'r.xlsx')
    expect(detectLayout(table!, NOV)).toBe('grid')
    const mapping = suggestMapping(table!, 'grid', NOV)
    expect(mapping.roles).toMatchObject({ employeeId: 0, employeeName: 1 })
    expect(Object.keys(mapping.dayColumns!)).toHaveLength(30)
    const { rows } = toStagingRows(table!, 'grid', mapping)
    expect(rows).toHaveLength(90)
    expect(rows[0]).toMatchObject({ employee_ref: 'P-1001', date: '2026-11-01', code: 'F' })
    expect(rows.find((r) => r.employee_ref === 'P-1001' && r.date === '2026-11-07')!.code).toBe('-')
  })

  it('reports unreadable values with their line number', () => {
    const table = toTable('x', [
      ['Pers.-Nr.', 'Datum', 'Dienst', 'Beginn', 'Ende'],
      ['P-1', '32.13.2026', 'F', '6:00', '14:00'],
      ['P-2', '02.11.2026', 'F', '6 Uhr 30', '14:00'],
      ['', '02.11.2026', 'F', '', ''],
    ])
    const { rows, problems } = toStagingRows(table, 'list', suggestMapping(table, 'list', NOV))
    expect(problems).toEqual([
      { line: 2, code: 'invalid_date', value: '32.13.2026' },
      { line: 3, code: 'invalid_time', value: '6 Uhr 30' },
      { line: 4, code: 'no_employee' },
    ])
    expect(rows).toHaveLength(2)
    // a half-readable time pair is not sent: the server falls back to the shift type
    expect(rows[1]).toMatchObject({ start: null, end: null })
  })
})
