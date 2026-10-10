import { useQuery } from '@tanstack/react-query'
import { wishRepository } from '@/data/wishRepository'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'

export function useWishPeriods() {
  const user = useCurrentUser()
  return useQuery({ queryKey: queryKeys.wishPeriods(user.id), queryFn: () => wishRepository.fetchPeriods() })
}

export function useMySubmission(periodId: string | null) {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.mySubmission(periodId ?? '', employment.employeeId),
    queryFn: () => wishRepository.fetchMySubmission(periodId!, employment.employeeId),
    enabled: !!periodId,
  })
}

export function useShiftTypes() {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.shiftTypes(employment.hospital.id),
    queryFn: () => wishRepository.fetchShiftTypes(employment.hospital.id),
    staleTime: 30 * 60_000,
  })
}

export function useWishScope() {
  const user = useCurrentUser()
  return useQuery({ queryKey: queryKeys.wishScope(user.id), queryFn: () => wishRepository.fetchScope(), staleTime: 5 * 60_000 })
}
