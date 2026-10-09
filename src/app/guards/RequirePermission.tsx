import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Permission } from '@/domain/permissions'
import { useTenant } from '@/features/tenant/TenantProvider'

/** UX guard only – the database enforces the same rule through RLS. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useTenant()
  return can(permission) ? <>{children}</> : <Navigate to="/" replace />
}
