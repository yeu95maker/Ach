import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { staffingRepository } from '@/data/staffingRepository'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'

/** Everything that shows who works which shift. */
function useInvalidateRosters() {
  const employment = useEmployment()
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [
        ['sick-shifts'],
        ['shift-candidates'],
        ['open-shifts'],
        ['open-interests'],
        ['editor-entries'],
        ['roster'],
        ['on-duty'],
        queryKeys.dashboard(employment.employeeId),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

export function useSickLeaveShifts(sickLeaveId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.sickShifts(sickLeaveId),
    queryFn: () => staffingRepository.fetchSickLeaveShifts(sickLeaveId),
    enabled,
  })
}

export function useShiftCandidates(entryId: string | null) {
  return useQuery({
    queryKey: queryKeys.shiftCandidates(entryId ?? ''),
    queryFn: () => staffingRepository.fetchCandidates(entryId!),
    enabled: !!entryId,
    staleTime: 0,
  })
}

export function useAssignShift() {
  const invalidate = useInvalidateRosters()
  return useMutation({
    mutationFn: (v: { entryId: string; employeeId: string }) => staffingRepository.assignShift(v.entryId, v.employeeId),
    onSuccess: () => invalidate(),
  })
}

export function useReleaseShift() {
  const invalidate = useInvalidateRosters()
  return useMutation({
    mutationFn: (entryId: string) => staffingRepository.releaseShift(entryId),
    onSuccess: () => invalidate(),
  })
}

export function useOpenShifts(unitIds: string[]) {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.openShifts(employment.hospital.id, unitIds),
    queryFn: () => staffingRepository.fetchOpenShifts(employment.hospital.id, unitIds),
  })
}

export function useOpenShiftInterests(entryIds: string[]) {
  return useQuery({
    queryKey: queryKeys.openInterests(entryIds),
    queryFn: () => staffingRepository.fetchInterests(entryIds),
    enabled: entryIds.length > 0,
  })
}

export function useInterestMutation() {
  const invalidate = useInvalidateRosters()
  return useMutation({
    mutationFn: (v: { entryId: string; interested: boolean; note?: string | null }) =>
      v.interested ? staffingRepository.expressInterest(v.entryId, v.note ?? null) : staffingRepository.withdrawInterest(v.entryId),
    onSuccess: () => invalidate(),
  })
}
