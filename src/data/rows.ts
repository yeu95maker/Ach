/**
 * Row shapes returned by Supabase (snake_case, JSON-serialised).
 * Kept close to the SQL schema in supabase/migrations. When the Supabase CLI
 * is available, these can be replaced by `supabase gen types typescript`.
 */
import type {
  LanguageProficiency,
  LeaveType,
  NotificationType,
  RequestStatus,
  ScheduleStatus,
  ShiftCategory,
  SickLeaveStatus,
  ThemePreference,
} from '@/domain/types'

export interface UserRow {
  id: string
  email: string
  first_name: string
  last_name: string
  avatar_path: string | null
  phone: string | null
  preferred_locale: string
  theme: ThemePreference
}

export interface MyContextRow {
  user: UserRow
  languages: { code: string; proficiency: LanguageProficiency }[]
  employments: {
    employee_id: string
    job_title: string
    hospital: { id: string; name: string; timezone: string; default_locale: string }
    units: { id: string; name: string; is_primary: boolean }[]
    roles: string[]
    permissions: string[]
    managed_unit_ids: string[]
  }[]
  platform_permissions: string[]
}

export interface QualificationRow {
  id: string
  code: string
  name: string
}

export interface ShiftRosterRow {
  entry_id: string
  hospital_id: string
  schedule_id: string
  schedule_status: ScheduleStatus
  unit_id: string
  unit_name: string
  employee_id: string | null
  kind: 'shift' | 'off'
  entry_date: string
  starts_at: string | null
  ends_at: string | null
  note: string | null
  shift_type_id: string | null
  shift_code: string | null
  shift_name: string | null
  shift_category: ShiftCategory | null
  shift_color: string | null
  first_name: string | null
  last_name: string | null
  avatar_path: string | null
  job_title: string | null
  qualifications: QualificationRow[] | null
  updated_at?: string | null
  imported_at?: string | null
}

export interface DirectoryRow {
  employee_id: string
  hospital_id: string
  user_id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  job_title: string
  primary_unit_id: string | null
  primary_unit_name: string | null
  languages: string[]
  qualifications: QualificationRow[]
}

export interface LeaveRequestRow {
  id: string
  hospital_id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  comment: string | null
  status: RequestStatus
  decision_note: string | null
  decided_at: string | null
  created_at: string
}

export interface SickLeaveRow {
  id: string
  hospital_id: string
  employee_id: string
  start_date: string
  end_date: string
  status: SickLeaveStatus
  acknowledged_at: string | null
  created_at: string
}

export interface NotificationRow {
  id: string
  type: NotificationType
  payload: Record<string, unknown> | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export interface ScheduleRow {
  id: string
  unit_id: string
  period_start: string
  period_end: string
  status: ScheduleStatus
  version: number
  published_at: string | null
  units: { name: string } | null
}

export interface DashboardRow {
  today: string
  today_entries: ShiftRosterRow[]
  next_shift: ShiftRosterRow | null
  absence_today: { type: 'vacation' | 'sick'; start_date: string; end_date: string } | null
  unread_notifications: number
  recent_notifications: NotificationRow[]
  my_open_requests: { id: string; leave_type: LeaveType; start_date: string; end_date: string; status: RequestStatus }[]
  open_shifts: {
    entry_id: string
    unit_name: string
    entry_date: string
    starts_at: string
    ends_at: string
    shift_name: string | null
    shift_category: ShiftCategory | null
  }[]
  pending_approvals: number
  unacknowledged_sick_leaves: number
  announcements: { id: string; title: string; body: string; priority: 'normal' | 'important'; published_at: string }[]
}

export interface EmployeeRow {
  id: string
  user_id: string
  personnel_number: string | null
  employment_type: string
  weekly_hours: number | null
  status: string
}
