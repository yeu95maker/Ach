import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from './cn'

type ListRowProps = {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  chevron?: boolean
  className?: string
  tone?: 'default' | 'danger'
}

export function ListRow({ icon, title, subtitle, trailing, to, onClick, chevron, className, tone = 'default' }: ListRowProps) {
  const interactive = !!(to || onClick)
  const content = (
    <>
      {icon && (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5',
            tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-surface-2 text-text-2',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-[15px] font-medium', tone === 'danger' ? 'text-danger-text' : 'text-text')}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-sm text-text-3">{subtitle}</span>}
      </span>
      {trailing}
      {(chevron ?? interactive) && <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />}
    </>
  )
  const cls = cn(
    'flex w-full min-h-16 items-center gap-3.5 px-4 py-3 sm:px-5',
    interactive && 'transition-colors duration-150 hover:bg-surface-2/70 active:bg-surface-2',
    className,
  )
  if (to) return <Link to={to} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('divide-y divide-border/70 overflow-hidden rounded-[var(--radius-card)] border border-border/70 bg-surface shadow-card', className)}>
      {children}
    </div>
  )
}
