import { useQuery } from '@tanstack/react-query'
import { dashboardRepository } from '@/data/dashboardRepository'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'

export function useDashboard() {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.dashboard(employment.employeeId),
    queryFn: () => dashboardRepository.fetch(employment.employeeId),
    refetchInterval: 5 * 60_000,
  })
}
