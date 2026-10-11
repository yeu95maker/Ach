import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { notificationRepository } from '@/data/notificationRepository'
import type { AppNotification } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment } from '@/features/tenant/TenantProvider'
import { useToast } from '@/ui'
import { useNotificationText } from './useNotificationText'

/**
 * Live in-app notifications via Supabase Realtime.
 * - refreshes the affected caches (roster, requests, dashboard …)
 * - shows a toast, and a system notification when the tab is hidden
 *   and the user granted permission.
 */
export function useRealtimeNotifications() {
  const user = useCurrentUser()
  const employment = useEmployment()
  const queryClient = useQueryClient()
  const toast = useToast()
  const render = useNotificationText()
  const renderRef = useRef(render)
  useEffect(() => {
    renderRef.current = render
  })

  useEffect(() => {
    const invalidate = (n: AppNotification) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
      if (n.type.startsWith('schedule') || n.type === 'open_shift') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.rosterAll(employment.employeeId) })
      }
      if (n.type.startsWith('leave')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.myLeave(employment.employeeId) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.teamLeave(employment.hospital.id) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.absencesAll(employment.employeeId) })
      }
      if (n.type.startsWith('wish_plan')) {
        void queryClient.invalidateQueries({ queryKey: ['wish-periods'] })
        void queryClient.invalidateQueries({ queryKey: ['wish-submission'] })
      }
      if (n.type === 'message') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chats(user.id) })
        if (typeof n.payload.unit_id === 'string') void queryClient.invalidateQueries({ queryKey: queryKeys.chat(n.payload.unit_id) })
      }
      if (n.type.startsWith('swap')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.swaps(user.id) })
        if (n.type === 'swap_approved') void queryClient.invalidateQueries({ queryKey: queryKeys.rosterAll(employment.employeeId) })
      }
      if (n.type.startsWith('sick')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.teamSick(employment.hospital.id) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.mySick(employment.employeeId) })
      }
    }

    return notificationRepository.subscribe(user.id, (n) => {
      invalidate(n)
      // Already looking at the chat: the message shows up there, no extra toast.
      if (n.type === 'message' && window.location.pathname.endsWith('/team/chat') && document.visibilityState === 'visible') return
      const { title, body } = renderRef.current(n)
      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.svg', tag: n.id })
      } else {
        toast.show({ tone: 'info', title, description: body })
      }
    })
  }, [user.id, employment.employeeId, employment.hospital.id, queryClient, toast])
}
