import { describe, expect, it } from 'vitest'
import { fileError, openAcks, overviewMatrix, safeFileName, type SharedDocument, type TrainingOverviewRow } from './documents'

describe('fileError', () => {
  it('accepts PDFs and images up to 20 MB', () => {
    expect(fileError({ type: 'application/pdf', size: 1000, name: 'sop.pdf' })).toBeNull()
    expect(fileError({ type: 'image/png', size: 21 * 1024 * 1024, name: 'a.png' })).toBe('size')
    expect(fileError({ type: 'application/zip', size: 10, name: 'a.zip' })).toBe('type')
  })
  it('keeps file names safe for the storage path', () => {
    expect(safeFileName('a/b\\c   d.pdf')).toBe('a_b_c d.pdf')
  })
})

describe('openAcks', () => {
  const base = { requiresAck: true, publishedAt: new Date(), acknowledgedAt: null, canManage: false } as SharedDocument
  it('lists published documents I still have to confirm', () => {
    expect(openAcks([base, { ...base, acknowledgedAt: new Date() }, { ...base, requiresAck: false }, { ...base, canManage: true }])).toHaveLength(1)
  })
})

describe('overviewMatrix', () => {
  const row = (employeeId: string, requirementId: string, status: TrainingOverviewRow['status']): TrainingOverviewRow => ({
    employeeId, firstName: employeeId, lastName: '', jobTitle: '', requirementId, title: requirementId, intervalMonths: 12, hospitalWide: false,
    completionId: null, completedOn: null, validUntil: null, verified: false, documentId: null, status,
  })
  it('counts open items per training', () => {
    const m = overviewMatrix([row('a', 'r1', 'missing'), row('b', 'r1', 'valid'), row('a', 'r2', 'due_soon')])
    expect(m.people).toHaveLength(2)
    expect(m.requirements.find((r) => r.id === 'r1')!.open).toBe(1)
    expect(m.requirements.find((r) => r.id === 'r2')!.open).toBe(1)
  })
})
