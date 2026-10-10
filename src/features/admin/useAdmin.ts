import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminRepository } from '@/data/adminRepository'
import { useEmployment } from '@/features/tenant/TenantProvider'

export const adminKeys = {
  employees: (hospitalId: string) => ['admin-employees', hospitalId] as const,
  roles: (hospitalId: string) => ['admin-roles', hospitalId] as const,
  organization: (hospitalId: string) => ['admin-organization', hospitalId] as const,
  shiftTypes: (hospitalId: string) => ['admin-shift-types', hospitalId] as const,
}

export function useAdminEmployees() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: adminKeys.employees(hospital.id), queryFn: () => adminRepository.fetchEmployees(hospital.id) })
}

export function useAssignableRoles() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: adminKeys.roles(hospital.id), queryFn: () => adminRepository.fetchAssignableRoles(hospital.id), staleTime: 5 * 60_000 })
}

export function useOrganization() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: adminKeys.organization(hospital.id), queryFn: () => adminRepository.fetchOrganization(hospital.id) })
}

export function useAdminShiftTypes() {
  const { hospital } = useEmployment()
  return useQuery({ queryKey: adminKeys.shiftTypes(hospital.id), queryFn: () => adminRepository.fetchShiftTypes(hospital.id) })
}

/** Refreshes admin lists and everything that shows people, wards or shift types. */
export function useAdminRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [['admin-employees'], ['admin-organization'], ['admin-shift-types'], ['directory'], ['employee-overview'], ['shift-types'], ['editor-shift-types'], ['unit-members'], ['wish-units']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    )
}
