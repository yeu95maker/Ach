import type { ISODate, ShiftCategory } from './types'

export type SwapStatus = 'pending_partner' | 'pending_lead' | 'approved' | 'declined' | 'rejected' | 'cancelled'
export type SwapRole = 'requester' | 'partner' | 'lead'

export interface SwapShift {
  entryId: string
  date: ISODate
  startsAt: Date
  endsAt: Date
  shiftName: string | null
  category: ShiftCategory | null
}

/** Row of get_shift_swaps(). */
export interface ShiftSwap {
  id: string
  status: SwapStatus
  role: SwapRole
  /** still open but the shift has already started */
  expired: boolean
  unitId: string
  unitName: string
  note: string | null
  decisionNote: string | null
  createdAt: Date
  decidedAt: Date | null
  requesterId: string
  requesterName: string
  partnerId: string
  partnerName: string
  shift: SwapShift
  /** null = hand-over without a shift in return */
  partnerShift: SwapShift | null
  warnings: string[]
}

/** Row of get_swap_options(): a colleague, optionally with one of their shifts in return. */
export interface SwapOption {
  partnerId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  partnerShift: (SwapShift & { shiftCode: string | null }) | null
  warnings: string[]
}

export const isOpen = (s: Pick<ShiftSwap, 'status' | 'expired'>) => !s.expired && (s.status === 'pending_partner' || s.status === 'pending_lead')

/** What the current user can do with a swap right now. */
export function swapAction(s: Pick<ShiftSwap, 'status' | 'role' | 'expired'>): 'respond' | 'decide' | 'cancel' | null {
  if (!isOpen(s)) return null
  if (s.role === 'partner' && s.status === 'pending_partner') return 'respond'
  if (s.role === 'lead' && s.status === 'pending_lead') return 'decide'
  if (s.role === 'requester') return 'cancel'
  return null
}

/** Needs my attention (badge count). */
export const needsMe = (s: Pick<ShiftSwap, 'status' | 'role' | 'expired'>) => {
  const a = swapAction(s)
  return a === 'respond' || a === 'decide'
}

/** Group options by colleague, hand-over first. */
export function groupOptions(options: SwapOption[]) {
  const map = new Map<string, { partner: SwapOption; handover: SwapOption | null; swaps: SwapOption[] }>()
  for (const o of options) {
    const g = map.get(o.partnerId) ?? { partner: o, handover: null, swaps: [] }
    if (o.partnerShift) g.swaps.push(o)
    else g.handover = o
    map.set(o.partnerId, g)
  }
  return [...map.values()]
}
