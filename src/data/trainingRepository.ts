import type { MyTraining, TrainingOverviewRow, TrainingStatus } from '@/domain/documents'
import { db, unwrap, unwrapList } from './client'

export const trainingRepository = {
  async fetchMine(): Promise<MyTraining[]> {
    return unwrapList<{
      requirement_id: string
      title: string
      description: string | null
      interval_months: number | null
      unit_id: string | null
      unit_name: string | null
      completion_id: string | null
      completed_on: string | null
      valid_until: string | null
      verified: boolean | null
      has_certificate: boolean | null
      status: TrainingStatus
    }>(await db().rpc('get_my_trainings')).map((r) => ({
      requirementId: r.requirement_id,
      title: r.title,
      description: r.description,
      intervalMonths: r.interval_months,
      unitId: r.unit_id,
      unitName: r.unit_name,
      completionId: r.completion_id,
      completedOn: r.completed_on,
      validUntil: r.valid_until,
      verified: !!r.verified,
      hasCertificate: !!r.has_certificate,
      status: r.status,
    }))
  },

  async fetchOverview(unitId: string): Promise<TrainingOverviewRow[]> {
    return unwrapList<{
      employee_id: string
      first_name: string
      last_name: string
      job_title: string
      requirement_id: string
      title: string
      interval_months: number | null
      hospital_wide: boolean
      completion_id: string | null
      completed_on: string | null
      valid_until: string | null
      verified: boolean | null
      document_id: string | null
      status: TrainingStatus
    }>(await db().rpc('get_training_overview', { p_unit_id: unitId })).map((r) => ({
      employeeId: r.employee_id,
      firstName: r.first_name,
      lastName: r.last_name,
      jobTitle: r.job_title,
      requirementId: r.requirement_id,
      title: r.title,
      intervalMonths: r.interval_months,
      hospitalWide: r.hospital_wide,
      completionId: r.completion_id,
      completedOn: r.completed_on,
      validUntil: r.valid_until,
      verified: !!r.verified,
      documentId: r.document_id,
      status: r.status,
    }))
  },

  async saveRequirement(v: { id: string | null; hospitalId: string; unitId: string | null; title: string; description: string | null; intervalMonths: number | null }) {
    unwrap(
      await db().rpc('save_training_requirement', {
        p_id: v.id,
        p_hospital_id: v.hospitalId,
        p_unit_id: v.unitId,
        p_title: v.title,
        p_description: v.description,
        p_interval_months: v.intervalMonths,
      }),
    )
  },

  async archiveRequirement(id: string) {
    unwrap(await db().rpc('archive_training_requirement', { p_id: id }))
  },

  async report(v: { requirementId: string; completedOn: string; documentId: string | null; note: string | null; employeeId?: string | null }) {
    unwrap(
      await db().rpc('report_training', {
        p_requirement_id: v.requirementId,
        p_completed_on: v.completedOn,
        p_document_id: v.documentId,
        p_note: v.note,
        p_employee_id: v.employeeId ?? null,
      }),
    )
  },

  async verify(completionId: string) {
    unwrap(await db().rpc('verify_training', { p_completion_id: completionId }))
  },

  async remove(completionId: string) {
    unwrap(await db().rpc('delete_training_completion', { p_completion_id: completionId }))
  },
}
