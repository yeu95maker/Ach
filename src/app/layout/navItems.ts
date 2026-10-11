import { Bell, CalendarDays, House, UserRound, UsersRound, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  badge?: 'unread' | 'chat'
}

/** The five primary destinations – identical on every device. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: House },
  { to: '/schedule', labelKey: 'nav.schedule', icon: CalendarDays },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, badge: 'unread' },
  { to: '/team', labelKey: 'nav.team', icon: UsersRound, badge: 'chat' },
  { to: '/profile', labelKey: 'nav.profile', icon: UserRound },
]
