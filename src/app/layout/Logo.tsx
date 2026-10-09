import { cn } from '@/ui'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0F3D91" />
      <path d="M20 34.5h7l3.5-9 6 17 3.5-8H46" fill="none" stroke="#18B7B0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[19px] font-bold tracking-tight text-text">
        Shift<span className="text-accent">Care</span>
      </span>
    </span>
  )
}
