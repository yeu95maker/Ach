import { CalendarDays, Newspaper, Palmtree, UsersRound, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '@/ui'

// Sick notes are deliberately not a quick action (decided 10.10.2026): they
// live under "Meine Anträge" so they are available but not in the foreground.
const ACTIONS: { to: string; labelKey: string; icon: LucideIcon; tone: string }[] = [
  { to: '/schedule', labelKey: 'actions.openSchedule', icon: CalendarDays, tone: 'bg-primary-soft text-primary-text' },
  { to: '/news', labelKey: 'actions.news', icon: Newspaper, tone: 'bg-accent-soft text-accent-text' },
  { to: '/requests/leave/new', labelKey: 'actions.requestLeave', icon: Palmtree, tone: 'bg-success-soft text-success-text' },
  { to: '/team', labelKey: 'actions.onDuty', icon: UsersRound, tone: 'bg-late-soft text-late-text' },
]

export function QuickActions() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('dashboard.quickActions')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a, i) => (
        <Link
          key={a.to}
          to={a.to}
          className="group flex min-h-[112px] animate-rise flex-col justify-between rounded-[var(--radius-card)] border border-border/70 bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] sm:p-5"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className={cn('flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105', a.tone)}>
            <a.icon className="size-[22px]" aria-hidden />
          </span>
          <span className="mt-3 text-[15px] leading-snug font-semibold">{t(a.labelKey)}</span>
        </Link>
      ))}
    </nav>
  )
}
