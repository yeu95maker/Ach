import type { AppNotification, NotificationType } from './types'

export type NotificationTone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

export interface NotificationMeta {
  tone: NotificationTone
  /** Route the notification opens when tapped. */
  route: string
}

const META: Record<NotificationType, NotificationMeta> = {
  schedule_published: { tone: 'primary', route: '/schedule' },
  schedule_changed: { tone: 'warning', route: '/schedule' },
  open_shift: { tone: 'accent', route: '/schedule' },
  leave_requested: { tone: 'primary', route: '/team?tab=requests' },
  leave_approved: { tone: 'success', route: '/requests' },
  leave_rejected: { tone: 'danger', route: '/requests' },
  sick_leave_reported: { tone: 'danger', route: '/team?tab=sick' },
  sick_leave_updated: { tone: 'neutral', route: '/requests' },
  announcement: { tone: 'accent', route: '/news' },
  message: { tone: 'primary', route: '/team/chat' },
  wish_plan_opened: { tone: 'accent', route: '/schedule/wishes' },
  wish_plan_deadline: { tone: 'warning', route: '/schedule/wishes' },
  wish_plan_submitted: { tone: 'success', route: '/schedule/wishes' },
  wish_plan_locked: { tone: 'neutral', route: '/schedule/wishes' },
  wish_plan_reviewed: { tone: 'primary', route: '/schedule/wishes' },
  open_shift_interest: { tone: 'accent', route: '/schedule/open' },
  roster_sync: { tone: 'warning', route: '/schedule/import?tab=history' },
}

export function notificationMeta(n: Pick<AppNotification, 'type' | 'payload'>): NotificationMeta {
  const meta = META[n.type] ?? META.message
  if (n.type === 'open_shift' || n.type === 'open_shift_interest') return meta
  if (n.type === 'schedule_changed' && typeof n.payload.entry_date === 'string') {
    return { ...meta, route: `/schedule?date=${n.payload.entry_date}&view=day` }
  }
  if (n.type === 'roster_sync' && typeof n.payload.run_id === 'string') {
    return { ...meta, route: `/schedule/import?run=${n.payload.run_id}` }
  }
  if (n.type === 'message' && typeof n.payload.unit_id === 'string') {
    return { ...meta, route: `/team/chat?unit=${n.payload.unit_id}` }
  }
  if (n.type.startsWith('wish_plan') && typeof n.payload.period_id === 'string') {
    return { ...meta, route: `/schedule/wishes?period=${n.payload.period_id}` }
  }
  return meta
}

export function payloadString(n: Pick<AppNotification, 'payload'>, key: string): string {
  const v = n.payload[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}
