import type { ISODate, RosterEntry } from '@/domain/types'
import type { Wish, WishPeriod, WishPeriodStatus, WishStatus, WishSubmission, WishType } from '@/domain/wishes'
import { db, unwrap, unwrapList } from './client'
import { mapRoster } from './mappers'
import type { ShiftRosterRow } from './rows'

interface WishPeriodRow {
  id: string
  unit_id: string
  period_start: string
  period_end: string
  opens_at: string | null
  deadline_at: string
  status: WishPeriodStatus
  allow_edit_after_submit: boolean
  reopened_at: string | null
  units: { name: string } | null
}

interface WishEntryRow {
  id: string
  wish_date: string
  preference_type: WishType
  shift_type_id: string | null
  note: string | null
  status: WishStatus
  review_note: string | null
}

export interface WishOverviewItem extends Wish {
  id: string
  periodId: string
  unitId: string
  unitName: string
  departmentId: string
  departmentName: string
  employeeId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  shiftCode: string | null
  shiftName: string | null
  status: WishStatus
  submissionNote: string | null
}

export interface ShiftTypeOption {
  id: string
  code: string
  name: string
  category: string
}

export interface UnitOption {
  id: string
  name: string
  departmentId: string
  departmentName: string
}

const PERIOD_COLUMNS = 'id, unit_id, period_start, period_end, opens_at, deadline_at, status, allow_edit_after_submit, reopened_at, units(name)'

const mapPeriod = (r: WishPeriodRow): WishPeriod => ({
  id: r.id,
  unitId: r.unit_id,
  unitName: r.units?.name ?? '',
  periodStart: r.period_start,
  periodEnd: r.period_end,
  opensAt: r.opens_at ? new Date(r.opens_at) : null,
  deadlineAt: new Date(r.deadline_at),
  status: r.status,
  allowEditAfterSubmit: r.allow_edit_after_submit,
  reopenedAt: r.reopened_at ? new Date(r.reopened_at) : null,
})

const mapEntry = (r: WishEntryRow): Wish => ({
  id: r.id,
  date: r.wish_date,
  type: r.preference_type,
  shiftTypeId: r.shift_type_id,
  note: r.note,
  status: r.status,
  reviewNote: r.review_note,
})

export interface NewWishPeriod {
  hospitalId: string
  unitId: string
  periodStart: ISODate
  periodEnd: ISODate
  deadlineAt: Date
  allowEditAfterSubmit: boolean
}

export const wishRepository = {
  /** Wish periods visible to the caller (RLS: own wards, published; or managed wards incl. drafts). */
  async fetchPeriods(): Promise<WishPeriod[]> {
    const rows = unwrapList<WishPeriodRow>(await db().from('wish_periods').select(PERIOD_COLUMNS).neq('status', 'archived').order('period_start', { ascending: false }).limit(48))
    return rows.map(mapPeriod)
  },

  async fetchMySubmission(periodId: string, employeeId: string): Promise<WishSubmission | null> {
    const subs = unwrapList<{ id: string; note: string | null; submitted_at: string }>(
      await db().from('wish_submissions').select('id, note, submitted_at').eq('period_id', periodId).eq('employee_id', employeeId).limit(1),
    )
    const sub = subs[0]
    if (!sub) return null
    const entries = unwrapList<WishEntryRow>(
      await db()
        .from('wish_entries')
        .select('id, wish_date, preference_type, shift_type_id, note, status, review_note')
        .eq('submission_id', sub.id)
        .order('wish_date'),
    )
    return { id: sub.id, note: sub.note, submittedAt: new Date(sub.submitted_at), wishes: entries.map(mapEntry) }
  },

  /** Submits (or re-submits) the whole Wunschplan. Deadline & rules are enforced server-side. */
  async submit(periodId: string, wishes: Wish[], note: string | null): Promise<string> {
    return unwrap<string>(
      await db().rpc('submit_wish_plan', {
        p_period_id: periodId,
        p_entries: wishes.map((w) => ({ date: w.date, type: w.type, shift_type_id: w.shiftTypeId, note: w.note?.trim() || null })),
        p_note: note?.trim() || null,
      }),
    )
  },

  async fetchShiftTypes(hospitalId: string): Promise<ShiftTypeOption[]> {
    return unwrapList<ShiftTypeOption>(
      await db().from('shift_types').select('id, code, name, category').eq('hospital_id', hospitalId).eq('is_active', true).order('sort_order'),
    )
  },

  // ------------------------------------------------------------ scheduler ----
  async fetchScope(): Promise<{ viewUnitIds: string[]; manageUnitIds: string[] }> {
    const r = unwrap<{ view_unit_ids: string[]; manage_unit_ids: string[] }>(await db().rpc('my_wish_scope'))
    return { viewUnitIds: r.view_unit_ids, manageUnitIds: r.manage_unit_ids }
  },

  async fetchUnits(hospitalId: string): Promise<UnitOption[]> {
    const rows = unwrapList<{ id: string; name: string; department_id: string; departments: { name: string } | null }>(
      await db().from('units').select('id, name, department_id, departments(name)').eq('hospital_id', hospitalId).eq('is_active', true).order('name'),
    )
    return rows.map((u) => ({ id: u.id, name: u.name, departmentId: u.department_id, departmentName: u.departments?.name ?? '' }))
  },

  /** Unit memberships – to list employees who have not submitted yet. */
  async fetchUnitMembers(unitIds: string[]): Promise<{ employeeId: string; unitId: string }[]> {
    if (!unitIds.length) return []
    const rows = unwrapList<{ employee_id: string; unit_id: string }>(await db().from('employee_units').select('employee_id, unit_id').in('unit_id', unitIds))
    return rows.map((r) => ({ employeeId: r.employee_id, unitId: r.unit_id }))
  },

  async fetchOverview(periodIds: string[]): Promise<WishOverviewItem[]> {
    if (!periodIds.length) return []
    const rows = unwrapList<Record<string, unknown>>(
      await db()
        .from('wish_overview')
        .select(
          'id, period_id, unit_id, unit_name, department_id, department_name, employee_id, first_name, last_name, avatar_path, job_title, wish_date, preference_type, shift_type_id, shift_code, shift_name, note, status, review_note, submission_note',
        )
        .in('period_id', periodIds)
        .order('wish_date'),
    )
    return rows.map((r) => ({
      id: r.id as string,
      periodId: r.period_id as string,
      unitId: r.unit_id as string,
      unitName: r.unit_name as string,
      departmentId: r.department_id as string,
      departmentName: r.department_name as string,
      employeeId: r.employee_id as string,
      firstName: (r.first_name as string) ?? '',
      lastName: (r.last_name as string) ?? '',
      avatarPath: (r.avatar_path as string | null) ?? null,
      jobTitle: (r.job_title as string) ?? '',
      date: r.wish_date as string,
      type: r.preference_type as WishType,
      shiftTypeId: (r.shift_type_id as string | null) ?? null,
      shiftCode: (r.shift_code as string | null) ?? null,
      shiftName: (r.shift_name as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      status: r.status as WishStatus,
      reviewNote: (r.review_note as string | null) ?? null,
      submissionNote: (r.submission_note as string | null) ?? null,
    }))
  },

  /** Planned roster (drafts included for schedulers) – shown NEXT TO the wishes, never merged. */
  async fetchPlanned(unitIds: string[], from: ISODate, to: ISODate): Promise<RosterEntry[]> {
    if (!unitIds.length) return []
    const rows = unwrapList<ShiftRosterRow>(
      await db()
        .from('shift_roster')
        .select(
          'entry_id, hospital_id, schedule_id, schedule_status, unit_id, unit_name, employee_id, kind, entry_date, starts_at, ends_at, note, shift_type_id, shift_code, shift_name, shift_category, shift_color, first_name, last_name, avatar_path, job_title, qualifications',
        )
        .in('unit_id', unitIds)
        .gte('entry_date', from)
        .lte('entry_date', to),
    )
    return rows.map(mapRoster)
  },

  async review(entryIds: string[], status: Extract<WishStatus, 'under_review' | 'considered' | 'not_considered'>, note: string | null) {
    return unwrap<number>(await db().rpc('review_wishes', { p_entry_ids: entryIds, p_status: status, p_note: note }))
  },

  async createPeriod(input: NewWishPeriod): Promise<string> {
    const rows = unwrapList<{ id: string }>(
      await db()
        .from('wish_periods')
        .insert({
          hospital_id: input.hospitalId,
          unit_id: input.unitId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          deadline_at: input.deadlineAt.toISOString(),
          allow_edit_after_submit: input.allowEditAfterSubmit,
        })
        .select('id'),
    )
    return rows[0]!.id
  },

  async updatePeriod(id: string, patch: Partial<{ status: WishPeriodStatus; deadlineAt: Date; allowEditAfterSubmit: boolean }>) {
    const row: Record<string, unknown> = {}
    if (patch.deadlineAt) row.deadline_at = patch.deadlineAt.toISOString()
    if (patch.allowEditAfterSubmit !== undefined) row.allow_edit_after_submit = patch.allowEditAfterSubmit
    if (patch.status) row.status = patch.status
    unwrap(await db().from('wish_periods').update(row).eq('id', id))
  },
}
