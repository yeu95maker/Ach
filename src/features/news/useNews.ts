import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { newsRepository } from '@/data/newsRepository'
import { can } from '@/domain/permissions'
import type { NewsDraft } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'

export function useNewsFeed(limit?: number) {
  const employment = useEmployment()
  return useQuery({
    queryKey: [...queryKeys.news(employment.hospital.id), limit ?? 'all'],
    queryFn: () => newsRepository.fetchFeed(employment.hospital.id, limit),
  })
}

export function useNewsTargets() {
  const employment = useEmployment()
  return useQuery({
    queryKey: queryKeys.newsTargets(employment.hospital.id),
    queryFn: () => newsRepository.fetchTargets(employment.hospital.id),
    enabled: can(employment, 'announcements.publish'),
    staleTime: 5 * 60_000,
  })
}

export function usePublishNews() {
  const employment = useEmployment()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: NewsDraft) => newsRepository.publish(draft),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.news(employment.hospital.id) }),
  })
}

export function useRemoveNews() {
  const employment = useEmployment()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => newsRepository.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.news(employment.hospital.id) }),
  })
}
