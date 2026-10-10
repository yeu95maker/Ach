/**
 * Permission keys – mirror of public.permissions in the database.
 * UI code checks permissions, never role names; the database enforces the
 * same permissions through RLS, so the UI check is purely for UX.
 */
export const PERMISSIONS = [
  'schedule.view',
  'schedule.view_drafts',
  'schedule.manage',
  'schedule.publish',
  'team.view',
  'employees.view',
  'employees.manage',
  'roles.assign',
  'roles.manage',
  'leave.request',
  'leave.view',
  'leave.approve',
  'sick_leave.report',
  'sick_leave.view',
  'sick_leave.view_details',
  'announcements.publish',
  'documents.view',
  'documents.manage',
  'qualifications.manage',
  'organization.manage',
  'settings.manage',
  'audit.view',
  'wishes.submit',
  'wishes.view',
  'wishes.manage',
  'schedule.import',
  'integrations.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export function toPermissionSet(keys: readonly string[]): ReadonlySet<Permission> {
  return new Set(keys.filter(isPermission))
}

export function can(employment: { permissions: ReadonlySet<Permission> } | null | undefined, permission: Permission): boolean {
  return !!employment?.permissions.has(permission)
}

export function canAny(employment: { permissions: ReadonlySet<Permission> } | null | undefined, permissions: readonly Permission[]) {
  return permissions.some((p) => can(employment, p))
}

/** True for any management capability that unlocks the manager area of the Team tab. */
export function isManager(employment: { permissions: ReadonlySet<Permission> } | null | undefined) {
  return canAny(employment, ['employees.view', 'leave.approve', 'sick_leave.view', 'schedule.publish'])
}
