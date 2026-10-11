import type { DocumentAck, DocumentTrainingScope, SharedDocument } from '@/domain/documents'
import { safeFileName } from '@/domain/documents'
import { db, unwrap, unwrapList } from './client'

interface DocumentRow {
  id: string
  hospital_id: string
  unit_id: string | null
  unit_name: string | null
  category: string
  title: string
  description: string | null
  file_name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  version: number
  requires_ack: boolean
  published_at: string | null
  created_at: string
  acknowledged_at: string | null
  can_manage: boolean
  acked: number | null
  audience: number | null
}

const date = (v: string | null) => (v ? new Date(v) : null)

export interface NewDocument {
  hospitalId: string
  unitId: string | null
  title: string
  category: string
  description: string | null
  requiresAck: boolean
  file: File
  supersedesId?: string | null
}

async function upload(path: string, file: File) {
  const { error } = await db().storage.from('documents').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
}

export const documentRepository = {
  async fetchDocuments(): Promise<SharedDocument[]> {
    return unwrapList<DocumentRow>(await db().rpc('get_documents')).map((r) => ({
      id: r.id,
      hospitalId: r.hospital_id,
      unitId: r.unit_id,
      unitName: r.unit_name,
      category: r.category,
      title: r.title,
      description: r.description,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      storagePath: r.storage_path,
      version: r.version,
      requiresAck: r.requires_ack,
      publishedAt: date(r.published_at),
      createdAt: new Date(r.created_at),
      acknowledgedAt: date(r.acknowledged_at),
      canManage: r.can_manage,
      acked: r.acked,
      audience: r.audience,
    }))
  },

  async fetchScope(hospitalId: string): Promise<DocumentTrainingScope> {
    const r = unwrap<{
      document_units: { id: string; name: string }[]
      document_hospital: boolean
      training_units: { id: string; name: string }[]
      training_hospital: boolean
    }>(await db().rpc('get_document_training_scope', { p_hospital_id: hospitalId }))
    return { documentUnits: r.document_units, documentHospital: r.document_hospital, trainingUnits: r.training_units, trainingHospital: r.training_hospital }
  },

  /** Draft → upload → publish. A failed upload leaves an invisible draft only. */
  async publish(d: NewDocument): Promise<void> {
    const row = unwrap<{ id: string; storage_path: string }>(
      await db().rpc('create_document', {
        p_hospital_id: d.hospitalId,
        p_unit_id: d.unitId,
        p_title: d.title,
        p_category: d.category,
        p_description: d.description,
        p_requires_ack: d.requiresAck,
        p_file_name: safeFileName(d.file.name),
        p_mime_type: d.file.type,
        p_size_bytes: d.file.size,
        p_supersedes_id: d.supersedesId ?? null,
      }),
    )
    await upload(row.storage_path, d.file)
    unwrap(await db().rpc('publish_document', { p_document_id: row.id }))
  },

  async archive(id: string): Promise<void> {
    unwrap(await db().rpc('archive_document', { p_document_id: id }))
  },

  async acknowledge(id: string): Promise<void> {
    unwrap(await db().rpc('acknowledge_document', { p_document_id: id }))
  },

  async fetchAcks(id: string): Promise<DocumentAck[]> {
    return unwrapList<{ employee_id: string; first_name: string; last_name: string; job_title: string; acknowledged_at: string | null }>(
      await db().rpc('get_document_acks', { p_document_id: id }),
    ).map((r) => ({ employeeId: r.employee_id, firstName: r.first_name, lastName: r.last_name, jobTitle: r.job_title, acknowledgedAt: date(r.acknowledged_at) }))
  },

  async remind(id: string): Promise<number> {
    return unwrap<number>(await db().rpc('remind_document', { p_document_id: id }))
  },

  /** Short-lived link to the file (5 minutes). */
  async fileUrl(storagePath: string): Promise<string> {
    const { data, error } = await db().storage.from('documents').createSignedUrl(storagePath, 300)
    if (error) throw error
    return data.signedUrl
  },

  /** Private certificate of the current employee (for a training). */
  async uploadPrivate(hospitalId: string, employeeId: string, title: string, file: File): Promise<string> {
    const row = unwrap<{ id: string; storage_path: string }>(
      await db()
        .from('documents')
        .insert({
          hospital_id: hospitalId,
          employee_id: employeeId,
          category: 'training_proof',
          title,
          file_name: safeFileName(file.name),
          mime_type: file.type,
          size_bytes: file.size,
          visibility: 'private',
        })
        .select('id, storage_path')
        .single(),
    )
    await upload(row.storage_path, file)
    return row.id
  },
}
