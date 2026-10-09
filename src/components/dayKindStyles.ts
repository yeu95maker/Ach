import type { DayKind } from '@/domain/types'

/** Colour coding of shifts and absences – one place for the whole app. */
export const dayKindStyles: Record<DayKind, { soft: string; solid: string; text: string; dot: string; border: string }> = {
  early: { soft: 'bg-early-soft', solid: 'bg-early', text: 'text-early-text', dot: 'bg-early', border: 'border-early' },
  late: { soft: 'bg-late-soft', solid: 'bg-late', text: 'text-late-text', dot: 'bg-late', border: 'border-late' },
  night: { soft: 'bg-night-soft', solid: 'bg-night', text: 'text-night-text', dot: 'bg-night', border: 'border-night' },
  day: { soft: 'bg-day-soft', solid: 'bg-day', text: 'text-day-text', dot: 'bg-day', border: 'border-day' },
  other: { soft: 'bg-primary-soft', solid: 'bg-primary', text: 'text-primary-text', dot: 'bg-primary', border: 'border-primary' },
  vacation: { soft: 'bg-vacation-soft', solid: 'bg-vacation', text: 'text-vacation-text', dot: 'bg-vacation', border: 'border-vacation' },
  sick: { soft: 'bg-sick-soft', solid: 'bg-sick', text: 'text-sick-text', dot: 'bg-sick', border: 'border-sick' },
  off: { soft: 'bg-off-soft', solid: 'bg-off', text: 'text-off-text', dot: 'bg-off', border: 'border-off' },
}

export const LEGEND_KINDS: readonly DayKind[] = ['early', 'late', 'night', 'vacation', 'sick', 'off']
