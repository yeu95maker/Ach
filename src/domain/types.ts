/**
 * Domain model of Dienstwerk – framework- and backend-agnostic.
 * The data layer maps database rows into these types; UI code only ever
 * works with these types.
 */
import type { Permission } from './permissions'

/** Calendar date without time, `YYYY-MM-DD`, in the hospital's time zone. */
export type ISODate = string

export type ShiftCategory = 'early' | 'late' | 'night' | 'day' | 'other'
/** What a calendar day "is" for a person – drives the colour coding. */
export type DayKind = ShiftCategory | 'vacation' | 'sick' | 'off'

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type LeaveType = 'vacation' | 'special' | 'unpaid' | 'training' | 'overtime_compensation'
export type SickLeaveStatus = 'reported' | 'acknowledged' | 'closed' | 'cancelled'
export type ScheduleStatus = 'draft' | 'published' | 'archived'
export type ThemePreference = 'system' | 'light' | 'dark'
export type LanguageProficiency = 'native' | 'fluent' | 'intermediate' | 'basic'

export type NotificationType =
  | 'schedule_published'
  | 'schedule_changed'
  | 'open_shift'
  | 'leave_requested'
  | 'leave_approved'
  | 'leave_rejected'
  | 'sick_leave_reported'
  | 'sick_leave_updated'
  | 'announcement'
  | 'message'
  | 'wish_plan_opened'
  | 'wish_plan_deadline'
  | 'wish_plan_submitted'
  | 'wish_plan_locked'
  | 'wish_plan_reviewed'
  | 'open_shift_interest'
  | 'roster_sync'
  | 'swap_requested'
  | 'swap_pending'
  | 'swap_declined'
  | 'swap_approved'
  | 'swap_rejected'
  | 'document_published'
  | 'document_reminder'
  | 'training_assigned'
  | 'training_due'
  | 'account_deletion_requested'

export interface Hospital {
  id: string
  name: string
  timezone: string
  defaultLocale: string
}

export interface UnitRef {
  id: string
  name: string
  isPrimary: boolean
}

export interface Employment {
  employeeId: string
  jobTitle: string
  hospital: Hospital
  units: UnitRef[]
  roles: string[]
  permissions: ReadonlySet<Permission>
  managedUnitIds: string[]
}

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarPath: string | null
  phone: string | null
  preferredLocale: string
  theme: ThemePreference
}

export interface SpokenLanguage {
  code: string
  proficiency: LanguageProficiency
}

export interface SessionContext {
  user: UserProfile
  languages: SpokenLanguage[]
  employments: Employment[]
  platformPermissions: string[]
}

export interface ShiftTypeRef {
  id: string
  code: string
  name: string
  category: ShiftCategory
  color: string | null
}

export interface Qualification {
  id: string
  code: string
  name: string
}

export interface PersonRef {
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  qualifications: Qualification[]
}

/** One roster entry (shift, day off or open shift). */
export interface RosterEntry {
  id: string
  scheduleId: string
  scheduleStatus: ScheduleStatus
  unitId: string
  unitName: string
  employeeId: string | null
  kind: 'shift' | 'off'
  date: ISODate
  startsAt: Date | null
  endsAt: Date | null
  note: string | null
  /** last change of this entry (manual or import) */
  updatedAt?: Date | null
  /** set when the entry came from an external roster import */
  importedAt?: Date | null
  shiftType: ShiftTypeRef | null
  person: PersonRef | null
}

export interface Absence {
  id: string
  kind: 'vacation' | 'sick'
  startDate: ISODate
  endDate: ISODate
  /** Leave type for vacation-like absences. */
  leaveType?: LeaveType
}

export interface LeaveRequest {
  id: string
  employeeId: string
  leaveType: LeaveType
  startDate: ISODate
  endDate: ISODate
  comment: string | null
  status: RequestStatus
  decisionNote: string | null
  decidedAt: Date | null
  createdAt: Date
}

export interface SickLeave {
  id: string
  employeeId: string
  startDate: ISODate
  endDate: ISODate
  status: SickLeaveStatus
  acknowledgedAt: Date | null
  createdAt: Date
}

export interface Colleague {
  employeeId: string
  userId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  primaryUnitId: string | null
  primaryUnitName: string | null
  languages: string[]
  qualifications: Qualification[]
}

export interface AppNotification {
  id: string
  type: NotificationType
  payload: Record<string, unknown>
  entityType: string | null
  entityId: string | null
  readAt: Date | null
  createdAt: Date
}

export interface Announcement {
  id: string
  title: string
  body: string
  priority: 'normal' | 'important'
  publishedAt: Date
}

export type NewsCategory = 'information' | 'training' | 'further_education' | 'workshop' | 'team_meeting' | 'doctor_meeting' | 'other'

/** "Aktuelles": information, Fortbildung, Teamsitzung, Arztgespräch … */
export interface NewsItem extends Announcement {
  category: NewsCategory
  unitId: string | null
  unitName: string | null
  eventStartsAt: Date | null
  eventEndsAt: Date | null
  location: string | null
  authorId: string | null
}

export interface NewsTarget {
  hospitalId: string
  /** null = whole hospital */
  unitId: string | null
  unitName: string | null
}

export interface NewsDraft {
  hospitalId: string
  unitId: string | null
  category: NewsCategory
  title: string
  body: string
  priority: 'normal' | 'important'
  eventStartsAt: Date | null
  eventEndsAt: Date | null
  location: string | null
}

export interface OpenShift {
  id: string
  unitName: string
  date: ISODate
  startsAt: Date
  endsAt: Date
  shiftName: string | null
  category: ShiftCategory | null
}

export interface DashboardSummary {
  today: ISODate
  todayEntries: RosterEntry[]
  nextShift: RosterEntry | null
  absenceToday: { kind: 'vacation' | 'sick'; startDate: ISODate; endDate: ISODate } | null
  unreadNotifications: number
  recentNotifications: AppNotification[]
  myOpenRequests: Pick<LeaveRequest, 'id' | 'leaveType' | 'startDate' | 'endDate' | 'status'>[]
  openShifts: OpenShift[]
  pendingApprovals: number
  unacknowledgedSickLeaves: number
  announcements: Announcement[]
}

/** A colleague's leave request / sick leave as seen by a manager. */
export interface TeamLeaveRequest extends LeaveRequest {
  person: Pick<Colleague, 'firstName' | 'lastName' | 'avatarPath' | 'jobTitle'> | null
}

export interface TeamSickLeave extends SickLeave {
  person: Pick<Colleague, 'firstName' | 'lastName' | 'avatarPath' | 'jobTitle'> | null
}

export interface ScheduleSummary {
  id: string
  unitId: string
  unitName: string
  periodStart: ISODate
  periodEnd: ISODate
  status: ScheduleStatus
  version: number
  publishedAt: Date | null
}
