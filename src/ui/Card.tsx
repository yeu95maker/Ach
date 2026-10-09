import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from './cn'

type CardProps = HTMLAttributes<HTMLDivElement> & { padding?: 'none' | 'sm' | 'md' | 'lg' }

const paddings = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' }

export function Card({ padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-border/70 bg-surface shadow-card', paddings[padding], className)}
      {...rest}
    />
  )
}

export function CardHeader({ title, action, icon, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold tracking-tight text-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-text-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/** A whole-card link with a gentle hover lift. */
export function LinkCard({ to, className, children, padding = 'md' }: { to: string; className?: string; children: ReactNode; padding?: CardProps['padding'] }) {
  return (
    <Link
      to={to}
      className={cn(
        'block rounded-[var(--radius-card)] border border-border/70 bg-surface shadow-card transition-[transform,box-shadow] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.99]',
        paddings[padding],
        className,
      )}
    >
      {children}
    </Link>
  )
}
