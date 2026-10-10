import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  CalendarHeart,
  CalendarX2,
  Hand,
  Hourglass,
  ClipboardCheck,
  CalendarPlus,
  CheckCircle2,
  HeartPulse,
  Megaphone,
  MessageCircle,
  Palmtree,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { notificationMeta, type NotificationTone } from '@/domain/notifications'
import type { AppNotification, NotificationType } from '@/domain/types'
import { cn } from '@/ui'

const ICONS: Record<NotificationType, LucideIcon> = {
  schedule_published: CalendarCheck2,
  schedule_changed: CalendarClock,
  open_shift: CalendarPlus,
  leave_requested: Palmtree,
  leave_approved: CheckCircle2,
  leave_rejected: XCircle,
  sick_leave_reported: HeartPulse,
  sick_leave_updated: HeartPulse,
  announcement: Megaphone,
  message: MessageCircle,
  wish_plan_opened: CalendarHeart,
  wish_plan_deadline: Hourglass,
  wish_plan_submitted: CheckCircle2,
  wish_plan_locked: CalendarX2,
  wish_plan_reviewed: ClipboardCheck,
  open_shift_interest: Hand,
}

const TONES: Record<NotificationTone, string> = {
  primary: 'bg-primary-soft text-primary-text',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  neutral: 'bg-surface-2 text-text-2',
}

export function NotificationIcon({ notification, className }: { notification: Pick<AppNotification, 'type' | 'payload'>; className?: string }) {
  const Icon = ICONS[notification.type] ?? Bell
  const tone = notificationMeta(notification).tone
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TONES[tone], className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  )
}
