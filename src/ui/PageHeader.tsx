import type { ReactNode } from 'react'
import { cn } from './cn'

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex animate-fade-in flex-wrap items-end justify-between gap-4 sm:mb-8', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm font-medium text-text-3">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-text sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-text-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-text-3 uppercase">{children}</h2>
      {action}
    </div>
  )
}
