import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentRepository } from '@/data/documentRepository'
import { trainingRepository } from '@/data/trainingRepository'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'

export function useMyTrainings() {
  const user = useCurrentUser()
  return useQuery({ queryKey: queryKeys.myTrainings(user.id), queryFn: () => trainingRepository.fetchMine(), staleTime: 60_000 })
}

export function useTrainingOverview(unitId: string | null) {
  return useQuery({
    queryKey: queryKeys.trainingOverview(unitId ?? ''),
    queryFn: () => trainingRepository.fetchOverview(unitId!),
    enabled: !!unitId,
  })
}

export function useTrainingMutations() {
  const queryClient = useQueryClient()
  const employment = useEmployment()
  const invalidate = () =>
    Promise.all([['my-trainings'], ['training-overview']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  const opts = { onSuccess: () => invalidate() }
  return {
    save: useMutation({ mutationFn: trainingRepository.saveRequirement, ...opts }),
    archive: useMutation({ mutationFn: (id: string) => trainingRepository.archiveRequirement(id), ...opts }),
    /** Own report, optionally with a certificate file (stored as a private document). */
    report: useMutation({
      mutationFn: async (v: { requirementId: string; title: string; completedOn: string; note: string | null; file: File | null; employeeId?: string | null }) => {
        const documentId =
          v.file && !v.employeeId ? await documentRepository.uploadPrivate(employment.hospital.id, employment.employeeId, v.title, v.file) : null
        await trainingRepository.report({ requirementId: v.requirementId, completedOn: v.completedOn, documentId, note: v.note, employeeId: v.employeeId })
      },
      ...opts,
    }),
    verify: useMutation({ mutationFn: (id: string) => trainingRepository.verify(id), ...opts }),
    remove: useMutation({ mutationFn: (id: string) => trainingRepository.remove(id), ...opts }),
  }
}
