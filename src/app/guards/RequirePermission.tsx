import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Permission } from '@/domain/permissions'
import { useTenant } from '@/features/tenant/TenantProvider'

/** UX guard only – the database enforces the same rule through RLS. Several permissions = any of them. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const { can } = useTenant()
  const allowed = (Array.isArray(permission) ? permission : [permission]).some((p) => can(p))
  return allowed ? <>{children}</> : <Navigate to="/" replace />
}
