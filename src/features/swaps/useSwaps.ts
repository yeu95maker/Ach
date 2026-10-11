import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { swapRepository } from '@/data/swapRepository'
import { needsMe } from '@/domain/swaps'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'

export function useSwaps() {
  const user = useCurrentUser()
  return useQuery({ queryKey: queryKeys.swaps(user.id), queryFn: () => swapRepository.fetchSwaps(), staleTime: 30_000 })
}

export function useSwapOptions(entryId: string | null) {
  return useQuery({
    queryKey: queryKeys.swapOptions(entryId ?? ''),
    queryFn: () => swapRepository.fetchOptions(entryId!),
    enabled: !!entryId,
    staleTime: 0,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  const employment = useEmployment()
  return () =>
    Promise.all(
      [['swaps'], ['swap-options'], ['roster'], ['on-duty'], ['ward-status'], ['editor-entries'], queryKeys.dashboard(employment.employeeId)].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
}

export function useSwapMutations() {
  const invalidate = useInvalidate()
  const opts = { onSuccess: () => invalidate() }
  return {
    request: useMutation({
      mutationFn: (v: { entryId: string; partnerId: string; partnerEntryId: string | null; note: string | null }) =>
        swapRepository.request(v.entryId, v.partnerId, v.partnerEntryId, v.note),
      ...opts,
    }),
    respond: useMutation({ mutationFn: (v: { id: string; accept: boolean }) => swapRepository.respond(v.id, v.accept), ...opts }),
    decide: useMutation({
      mutationFn: (v: { id: string; approve: boolean; note: string | null }) => swapRepository.decide(v.id, v.approve, v.note),
      ...opts,
    }),
    cancel: useMutation({ mutationFn: (id: string) => swapRepository.cancel(id), ...opts }),
  }
}

/** Requests waiting for my answer or decision (nav badge). */
export function useSwapsNeedingMe() {
  return (useSwaps().data ?? []).filter(needsMe).length
}
