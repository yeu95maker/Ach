import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { chatRepository, PAGE_SIZE } from '@/data/chatRepository'
import { mergePages, totalUnread } from '@/domain/chat'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser } from '@/features/tenant/TenantProvider'

/** My ward chats with unread counts (also drives the badge on the Team tab). */
export function useChats() {
  const user = useCurrentUser()
  return useQuery({
    queryKey: queryKeys.chats(user.id),
    queryFn: chatRepository.listChats,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

export function useChatUnread() {
  return totalUnread(useChats().data)
}

/**
 * Messages of one ward chat, paged backwards. Live via Realtime; a slow poll
 * keeps it correct where Realtime is unavailable (tests, flaky networks).
 */
export function useChatMessages(unitId: string | null) {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: queryKeys.chat(unitId ?? ''),
    queryFn: ({ pageParam }) => chatRepository.fetchMessages(unitId!, pageParam),
    initialPageParam: undefined as Date | undefined,
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1]!.createdAt : undefined),
    enabled: !!unitId,
    refetchInterval: 20_000,
  })

  useEffect(() => {
    if (!unitId) return
    return chatRepository.subscribe(unitId, () => void queryClient.invalidateQueries({ queryKey: queryKeys.chat(unitId) }))
  }, [unitId, queryClient])

  const messages = useMemo(() => mergePages(query.data?.pages ?? []), [query.data])
  return { ...query, messages }
}

function useInvalidateChat(unitId: string | null) {
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.chat(unitId ?? '') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chats(user.id) }),
    ])
}

export function useSendMessage(unitId: string | null) {
  const invalidate = useInvalidateChat(unitId)
  return useMutation({ mutationFn: (body: string) => chatRepository.send(unitId!, body), onSuccess: invalidate })
}

export function useEditMessage(unitId: string | null) {
  const invalidate = useInvalidateChat(unitId)
  return useMutation({ mutationFn: (v: { id: string; body: string }) => chatRepository.edit(v.id, v.body), onSuccess: invalidate })
}

export function useRemoveMessage(unitId: string | null) {
  const invalidate = useInvalidateChat(unitId)
  return useMutation({
    mutationFn: (v: { id: string; as: 'author' | 'moderator' }) => (v.as === 'author' ? chatRepository.remove(v.id) : chatRepository.hide(v.id)),
    onSuccess: invalidate,
  })
}

/** Marks the chat read whenever a newer message arrives while it is open and visible. */
export function useMarkRead(unitId: string | null, newestId: string | undefined) {
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  useEffect(() => {
    if (!unitId || !newestId) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      void chatRepository.markRead(unitId).then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chats(user.id) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user.id) })
      })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [unitId, newestId, queryClient, user.id])
}
