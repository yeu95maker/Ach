import type { ISODate } from './types'

export const DOCUMENT_CATEGORIES = ['sop', 'guideline', 'checklist', 'form', 'information', 'other'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

/** Same list as the storage bucket and public.documents allow. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

/** null = fine, otherwise an i18n key below `documents.fileError.` */
export function fileError(file: Pick<File, 'type' | 'size' | 'name'>): 'type' | 'size' | 'name' | null {
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES) return 'size'
  if (!safeFileName(file.name)) return 'name'
  return null
}

/** File names end up in the storage path: no slashes, at most 200 characters. */
export function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\s+/g, ' ').trim().slice(-200)
}

export interface SharedDocument {
  id: string
  hospitalId: string
  unitId: string | null
  unitName: string | null
  category: string
  title: string
  description: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  version: number
  requiresAck: boolean
  publishedAt: Date | null
  createdAt: Date
  acknowledgedAt: Date | null
  canManage: boolean
  /** only for leads */
  acked: number | null
  audience: number | null
}

export interface DocumentAck {
  employeeId: string
  firstName: string
  lastName: string
  jobTitle: string
  acknowledgedAt: Date | null
}

/** Documents I still have to confirm. */
export const openAcks = (docs: SharedDocument[]) => docs.filter((d) => d.requiresAck && d.publishedAt && !d.acknowledgedAt && !d.canManage)

export interface ScopeUnit {
  id: string
  name: string
}
export interface DocumentTrainingScope {
  documentUnits: ScopeUnit[]
  documentHospital: boolean
  trainingUnits: ScopeUnit[]
  trainingHospital: boolean
}

// ----------------------------------------------------------------- trainings

export type TrainingStatus = 'missing' | 'expired' | 'due_soon' | 'valid'

export interface MyTraining {
  requirementId: string
  title: string
  description: string | null
  intervalMonths: number | null
  unitId: string | null
  unitName: string | null
  completionId: string | null
  completedOn: ISODate | null
  validUntil: ISODate | null
  verified: boolean
  hasCertificate: boolean
  status: TrainingStatus
}

export interface TrainingOverviewRow {
  employeeId: string
  firstName: string
  lastName: string
  jobTitle: string
  requirementId: string
  title: string
  intervalMonths: number | null
  hospitalWide: boolean
  completionId: string | null
  completedOn: ISODate | null
  validUntil: ISODate | null
  verified: boolean
  documentId: string | null
  status: TrainingStatus
}

export const needsAction = (s: TrainingStatus) => s !== 'valid'

export const STATUS_TONE: Record<TrainingStatus, 'danger' | 'warning' | 'success'> = {
  missing: 'danger',
  expired: 'danger',
  due_soon: 'warning',
  valid: 'success',
}

/** Overview rows → requirements (columns) and people (rows) with their cells. */
export function overviewMatrix(rows: TrainingOverviewRow[]) {
  const requirements = new Map<string, { id: string; title: string; intervalMonths: number | null; hospitalWide: boolean; open: number }>()
  const people = new Map<string, { id: string; firstName: string; lastName: string; jobTitle: string; cells: Map<string, TrainingOverviewRow> }>()
  for (const r of rows) {
    const req = requirements.get(r.requirementId) ?? { id: r.requirementId, title: r.title, intervalMonths: r.intervalMonths, hospitalWide: r.hospitalWide, open: 0 }
    if (needsAction(r.status)) req.open++
    requirements.set(r.requirementId, req)
    const p = people.get(r.employeeId) ?? { id: r.employeeId, firstName: r.firstName, lastName: r.lastName, jobTitle: r.jobTitle, cells: new Map() }
    p.cells.set(r.requirementId, r)
    people.set(r.employeeId, p)
  }
  return { requirements: [...requirements.values()], people: [...people.values()] }
}
