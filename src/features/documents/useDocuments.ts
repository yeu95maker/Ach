import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentRepository, type NewDocument } from '@/data/documentRepository'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'

export function useDocuments() {
  const user = useCurrentUser()
  return useQuery({ queryKey: queryKeys.documents(user.id), queryFn: () => documentRepository.fetchDocuments(), staleTime: 30_000 })
}

export function useDocumentScope() {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.docScope(employment.hospital.id),
    queryFn: () => documentRepository.fetchScope(employment.hospital.id),
    staleTime: 5 * 60_000,
  })
}

export function useDocumentAcks(id: string | null) {
  return useQuery({ queryKey: queryKeys.documentAcks(id ?? ''), queryFn: () => documentRepository.fetchAcks(id!), enabled: !!id, staleTime: 0 })
}

export function useDocumentMutations() {
  const queryClient = useQueryClient()
  const invalidate = () =>
    Promise.all([['documents'], ['document-acks']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  const opts = { onSuccess: () => invalidate() }
  return {
    publish: useMutation({ mutationFn: (d: NewDocument) => documentRepository.publish(d), ...opts }),
    archive: useMutation({ mutationFn: (id: string) => documentRepository.archive(id), ...opts }),
    acknowledge: useMutation({ mutationFn: (id: string) => documentRepository.acknowledge(id), ...opts }),
    remind: useMutation({ mutationFn: (id: string) => documentRepository.remind(id), ...opts }),
  }
}

/** Opens the file in a new tab via a short-lived link. */
export async function openDocumentFile(storagePath: string) {
  // Open synchronously (popup blockers), then point it at the signed URL.
  const win = window.open('', '_blank')
  try {
    const url = await documentRepository.fileUrl(storagePath)
    if (win) win.location.href = url
    else window.location.href = url
  } catch (e) {
    win?.close()
    throw e
  }
}
