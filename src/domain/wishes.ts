/**
 * Wunschplan – domain logic.
 *
 * A wish is a PREFERENCE, never a confirmed shift. Everything here keeps the
 * two apart: wishes are compared with the roster, never written into it.
 */
import type { ISODate, ShiftCategory } from './types'

export type WishType = 'free' | 'night' | 'early' | 'late' | 'preferred' | 'unavailable'
export type WishStatus = 'submitted' | 'under_review' | 'considered' | 'not_considered' | 'locked'
export type WishPeriodStatus = 'draft' | 'open' | 'locked' | 'archived'

/** Order in the picker – the most frequent wishes first. */
export const WISH_TYPES: readonly WishType[] = ['free', 'early', 'late', 'night', 'preferred', 'unavailable']
export const WISH_STATUSES: readonly WishStatus[] = ['submitted', 'under_review', 'considered', 'not_considered', 'locked']

/** Shift category a wish asks for (null = wants no shift / concrete shift type). */
export const WISH_CATEGORY: Record<WishType, ShiftCategory | null> = {
  free: null,
  night: 'night',
  early: 'early',
  late: 'late',
  preferred: null,
  unavailable: null,
}

export const wantsOff = (t: WishType) => t === 'free' || t === 'unavailable'

export interface Wish {
  id?: string
  date: ISODate
  type: WishType
  shiftTypeId: string | null
  note: string | null
  status?: WishStatus
  reviewNote?: string | null
}

export interface WishPeriod {
  id: string
  unitId: string
  unitName: string
  periodStart: ISODate
  periodEnd: ISODate
  opensAt: Date | null
  deadlineAt: Date
  status: WishPeriodStatus
  allowEditAfterSubmit: boolean
  reopenedAt: Date | null
}

export interface WishSubmission {
  id: string
  note: string | null
  submittedAt: Date
  wishes: Wish[]
}

export type EditBlockReason = 'not_open' | 'deadline_passed' | 'already_submitted'

/** Can the employee (still) change the Wunschplan? Mirrors the checks in submit_wish_plan(). */
export function wishPlanEditability(
  period: Pick<WishPeriod, 'status' | 'deadlineAt' | 'allowEditAfterSubmit'>,
  submission: Pick<WishSubmission, 'id'> | null,
  now = new Date(),
): { editable: true } | { editable: false; reason: EditBlockReason } {
  if (period.status !== 'open') return { editable: false, reason: 'not_open' }
  if (now > period.deadlineAt) return { editable: false, reason: 'deadline_passed' }
  if (submission && !period.allowEditAfterSubmit) return { editable: false, reason: 'already_submitted' }
  return { editable: true }
}

/**
 * Tap behaviour of the calendar ("paint" with the chosen wish type):
 * empty day → set · same wish → remove · different wish → replace.
 * Notes survive a type change so nothing typed gets lost.
 */
export function applyWish(
  wishes: ReadonlyMap<ISODate, Wish>,
  date: ISODate,
  type: WishType | 'erase',
  shiftTypeId: string | null = null,
): Map<ISODate, Wish> {
  const next = new Map(wishes)
  const current = next.get(date)
  if (type === 'erase') {
    next.delete(date)
    return next
  }
  const sameWish = current && current.type === type && (type !== 'preferred' || current.shiftTypeId === shiftTypeId)
  if (sameWish) next.delete(date)
  else next.set(date, { date, type, shiftTypeId: type === 'preferred' ? shiftTypeId : null, note: current?.note ?? null })
  return next
}

/** Stable comparison for "unsaved changes". */
export function wishesEqual(a: Iterable<Wish>, b: Iterable<Wish>): boolean {
  const key = (w: Wish) => `${w.date}|${w.type}|${w.shiftTypeId ?? ''}|${(w.note ?? '').trim()}`
  const ka = [...a].map(key).sort()
  const kb = [...b].map(key).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i])
}

export type WishMatch = 'match' | 'mismatch' | 'open'

/**
 * Compare a wish with what is planned that day (draft or published roster).
 *   match    – the plan fulfils the wish
 *   mismatch – the plan contradicts the wish (shown to the scheduler)
 *   open     – nothing planned yet
 */
export function compareWithPlan(
  wish: Pick<Wish, 'type' | 'shiftTypeId'>,
  planned: { kind: 'shift' | 'off'; category: ShiftCategory | null; shiftTypeId: string | null } | null,
): WishMatch {
  if (!planned) return 'open'
  if (wantsOff(wish.type)) return planned.kind === 'off' ? 'match' : 'mismatch'
  if (planned.kind === 'off') return 'mismatch'
  if (wish.type === 'preferred') return planned.shiftTypeId === wish.shiftTypeId ? 'match' : 'mismatch'
  return planned.category === WISH_CATEGORY[wish.type] ? 'match' : 'mismatch'
}

export function countByType(wishes: Iterable<Pick<Wish, 'type'>>): Record<WishType, number> {
  const counts = Object.fromEntries(WISH_TYPES.map((t) => [t, 0])) as Record<WishType, number>
  for (const w of wishes) counts[w.type]++
  return counts
}

/** Whole days until the deadline (0 = today). */
export function daysUntil(deadline: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000))
}
