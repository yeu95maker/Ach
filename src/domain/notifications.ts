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
  announcement: { tone: 'accent', route: '/' },
  message: { tone: 'neutral', route: '/notifications' },
}

export function notificationMeta(n: Pick<AppNotification, 'type' | 'payload'>): NotificationMeta {
  const meta = META[n.type] ?? META.message
  if ((n.type === 'schedule_changed' || n.type === 'open_shift') && typeof n.payload.entry_date === 'string') {
    return { ...meta, route: `/schedule?date=${n.payload.entry_date}&view=day` }
  }
  return meta
}

export function payloadString(n: Pick<AppNotification, 'payload'>, key: string): string {
  const v = n.payload[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}
