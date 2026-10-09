import { useState } from 'react'
import { cn } from './cn'

const sizes = {
  sm: 'size-9 text-[13px]',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl sm:size-28 sm:text-3xl',
}

const palettes = [
  'bg-primary-soft text-primary-text',
  'bg-accent-soft text-accent-text',
  'bg-late-soft text-late-text',
  'bg-early-soft text-early-text',
  'bg-success-soft text-success-text',
  'bg-day-soft text-day-text',
]

function hash(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function initials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || '?'
}

export function Avatar({
  src,
  firstName,
  lastName,
  size = 'md',
  className,
  ring,
}: {
  src?: string | null
  firstName: string
  lastName: string
  size?: keyof typeof sizes
  className?: string
  ring?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const name = `${firstName} ${lastName}`.trim()
  const showImage = src && !failed
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        sizes[size],
        !showImage && palettes[hash(name) % palettes.length],
        ring && 'ring-4 ring-surface',
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        initials(firstName, lastName)
      )}
    </span>
  )
}
