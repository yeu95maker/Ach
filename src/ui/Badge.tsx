import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2',
  primary: 'bg-primary-soft text-primary-text',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-text-3',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function Badge({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden />}
      {children}
    </span>
  )
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white tabular',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
