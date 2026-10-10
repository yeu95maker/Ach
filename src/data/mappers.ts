import { toPermissionSet } from '@/domain/permissions'
import type {
  AppNotification,
  Colleague,
  DashboardSummary,
  LeaveRequest,
  RosterEntry,
  SessionContext,
  SickLeave,
  UserProfile,
} from '@/domain/types'
import type {
  DashboardRow,
  DirectoryRow,
  LeaveRequestRow,
  MyContextRow,
  NotificationRow,
  ShiftRosterRow,
  SickLeaveRow,
  UserRow,
} from './rows'

const date = (v: string | null | undefined) => (v ? new Date(v) : null)

export function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarPath: row.avatar_path,
    phone: row.phone,
    preferredLocale: row.preferred_locale,
    theme: row.theme,
  }
}

export function mapContext(row: MyContextRow): SessionContext {
  return {
    user: mapUser(row.user),
    languages: row.languages,
    platformPermissions: row.platform_permissions,
    employments: row.employments.map((e) => ({
      employeeId: e.employee_id,
      jobTitle: e.job_title,
      hospital: {
        id: e.hospital.id,
        name: e.hospital.name,
        timezone: e.hospital.timezone,
        defaultLocale: e.hospital.default_locale,
      },
      units: e.units.map((u) => ({ id: u.id, name: u.name, isPrimary: u.is_primary })),
      roles: e.roles,
      permissions: toPermissionSet(e.permissions),
      managedUnitIds: e.managed_unit_ids,
    })),
  }
}

export function mapRoster(row: ShiftRosterRow): RosterEntry {
  return {
    id: row.entry_id,
    scheduleId: row.schedule_id,
    scheduleStatus: row.schedule_status,
    unitId: row.unit_id,
    unitName: row.unit_name,
    employeeId: row.employee_id,
    kind: row.kind,
    date: row.entry_date,
    startsAt: date(row.starts_at),
    endsAt: date(row.ends_at),
    note: row.note,
    updatedAt: date(row.updated_at ?? null),
    importedAt: date(row.imported_at ?? null),
    shiftType:
      row.shift_type_id && row.shift_category
        ? {
            id: row.shift_type_id,
            code: row.shift_code ?? '',
            name: row.shift_name ?? '',
            category: row.shift_category,
            color: row.shift_color,
          }
        : null,
    person:
      row.employee_id && row.first_name !== null
        ? {
            firstName: row.first_name ?? '',
            lastName: row.last_name ?? '',
            avatarPath: row.avatar_path,
            jobTitle: row.job_title ?? '',
            qualifications: row.qualifications ?? [],
          }
        : null,
  }
}

export function mapColleague(row: DirectoryRow): Colleague {
  return {
    employeeId: row.employee_id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarPath: row.avatar_path,
    jobTitle: row.job_title,
    primaryUnitId: row.primary_unit_id,
    primaryUnitName: row.primary_unit_name,
    languages: row.languages ?? [],
    qualifications: row.qualifications ?? [],
  }
}

export function mapLeaveRequest(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    comment: row.comment,
    status: row.status,
    decisionNote: row.decision_note,
    decidedAt: date(row.decided_at),
    createdAt: new Date(row.created_at),
  }
}

export function mapSickLeave(row: SickLeaveRow): SickLeave {
  return {
    id: row.id,
    employeeId: row.employee_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    acknowledgedAt: date(row.acknowledged_at),
    createdAt: new Date(row.created_at),
  }
}

export function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: date(row.read_at),
    createdAt: new Date(row.created_at),
  }
}

export function mapDashboard(row: DashboardRow): DashboardSummary {
  return {
    today: row.today,
    todayEntries: row.today_entries.map(mapRoster),
    nextShift: row.next_shift ? mapRoster(row.next_shift) : null,
    absenceToday: row.absence_today
      ? { kind: row.absence_today.type, startDate: row.absence_today.start_date, endDate: row.absence_today.end_date }
      : null,
    unreadNotifications: row.unread_notifications,
    recentNotifications: row.recent_notifications.map(mapNotification),
    myOpenRequests: row.my_open_requests.map((r) => ({
      id: r.id,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    })),
    openShifts: row.open_shifts.map((s) => ({
      id: s.entry_id,
      unitName: s.unit_name,
      date: s.entry_date,
      startsAt: new Date(s.starts_at),
      endsAt: new Date(s.ends_at),
      shiftName: s.shift_name,
      category: s.shift_category,
    })),
    pendingApprovals: row.pending_approvals,
    unacknowledgedSickLeaves: row.unacknowledged_sick_leaves,
    announcements: row.announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      priority: a.priority,
      publishedAt: new Date(a.published_at),
    })),
  }
}
