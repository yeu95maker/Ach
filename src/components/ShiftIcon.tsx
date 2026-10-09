import { Briefcase, CalendarOff, Moon, Palmtree, Sun, Sunrise, Sunset, Thermometer } from 'lucide-react'
import type { DayKind } from '@/domain/types'
import { cn } from '@/ui'

const ICONS = {
  early: Sunrise,
  late: Sunset,
  night: Moon,
  day: Sun,
  other: Briefcase,
  vacation: Palmtree,
  sick: Thermometer,
  off: CalendarOff,
} satisfies Record<DayKind, unknown>

export function ShiftIcon({ kind, className }: { kind: DayKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon className={cn('size-5', className)} aria-hidden />
}
