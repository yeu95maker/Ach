import type { ReactNode } from 'react'
import { cn } from './cn'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-6' : 'py-12', className)}>
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-3 [&_svg]:size-6">{icon}</div>
      )}
      <p className="text-[15px] font-semibold text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-text-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
