import { Ban, Check, Clock3, Coffee, Lock, Moon, Star, Sunrise, Sunset, X, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WishStatus, WishType } from '@/domain/wishes'
import { Badge, cn, type Tone } from '@/ui'

/** Colour coding of wishes – a single source for the whole Wunschplan feature. */
export const wishStyles: Record<WishType, { soft: string; solid: string; text: string; ring: string; icon: LucideIcon }> = {
  free: { soft: 'bg-wish-free-soft', solid: 'bg-wish-free', text: 'text-wish-free-text', ring: 'ring-wish-free', icon: Coffee },
  night: { soft: 'bg-wish-night-soft', solid: 'bg-wish-night', text: 'text-wish-night-text', ring: 'ring-wish-night', icon: Moon },
  early: { soft: 'bg-wish-early-soft', solid: 'bg-wish-early', text: 'text-wish-early-text', ring: 'ring-wish-early', icon: Sunrise },
  late: { soft: 'bg-wish-late-soft', solid: 'bg-wish-late', text: 'text-wish-late-text', ring: 'ring-wish-late', icon: Sunset },
  preferred: { soft: 'bg-wish-preferred-soft', solid: 'bg-wish-preferred', text: 'text-wish-preferred-text', ring: 'ring-wish-preferred', icon: Star },
  unavailable: { soft: 'bg-wish-unavailable-soft', solid: 'bg-wish-unavailable', text: 'text-wish-unavailable-text', ring: 'ring-wish-unavailable', icon: Ban },
}

export function WishIcon({ type, className }: { type: WishType; className?: string }) {
  const Icon = wishStyles[type].icon
  return <Icon className={cn('size-4', className)} aria-hidden />
}

/** Compact pill: icon + label (+ optional shift code for "Bevorzugter Dienst"). */
export function WishPill({ type, shiftCode, short, className }: { type: WishType; shiftCode?: string | null; short?: boolean; className?: string }) {
  const { t } = useTranslation()
  const s = wishStyles[type]
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap', s.soft, s.text, className)}>
      <WishIcon type={type} className="size-3.5" />
      {t(short ? `wishTypeShort.${type}` : `wishType.${type}`)}
      {type === 'preferred' && shiftCode && <span className="opacity-80">· {shiftCode}</span>}
    </span>
  )
}

const STATUS_TONES: Record<WishStatus, Tone> = {
  submitted: 'primary',
  under_review: 'warning',
  considered: 'success',
  not_considered: 'danger',
  locked: 'neutral',
}

const STATUS_ICONS: Record<WishStatus, LucideIcon> = {
  submitted: Check,
  under_review: Clock3,
  considered: Check,
  not_considered: X,
  locked: Lock,
}

export function WishStatusBadge({ status }: { status: WishStatus }) {
  const { t } = useTranslation()
  const Icon = STATUS_ICONS[status]
  return (
    <Badge tone={STATUS_TONES[status]}>
      <Icon className="size-3.5" aria-hidden />
      {t(`wishStatus.${status}`)}
    </Badge>
  )
}

/** Tiny status marker for calendar cells (only for statuses that carry news). */
export function WishStatusDot({ status, className }: { status: WishStatus; className?: string }) {
  const { t } = useTranslation()
  if (status === 'submitted') return null
  const Icon = STATUS_ICONS[status]
  const tone =
    status === 'considered' ? 'bg-success text-white' : status === 'not_considered' ? 'bg-danger text-white' : status === 'under_review' ? 'bg-warning text-white' : 'bg-text-3 text-white'
  return (
    <span className={cn('flex size-4 items-center justify-center rounded-full ring-2 ring-surface', tone, className)} title={t(`wishStatus.${status}`)}>
      <Icon className="size-2.5" strokeWidth={3} aria-label={t(`wishStatus.${status}`)} />
    </span>
  )
}
