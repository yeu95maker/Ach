import { cn } from '@/ui'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0F3D91" />
      <path d="M19.5 17h10a15 15 0 0 1 0 30h-10z" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <path d="M25.5 32.5l4 4 8-9" fill="none" stroke="#18B7B0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[19px] font-bold tracking-tight text-text">
        Dienst<span className="text-accent">werk</span>
      </span>
    </span>
  )
}
