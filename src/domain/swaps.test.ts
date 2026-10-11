import { describe, expect, it } from 'vitest'
import { groupOptions, isOpen, needsMe, swapAction, type SwapOption } from './swaps'

describe('swapAction', () => {
  it('asks the colleague, then the lead; the requester can withdraw', () => {
    expect(swapAction({ status: 'pending_partner', role: 'partner', expired: false })).toBe('respond')
    expect(swapAction({ status: 'pending_partner', role: 'requester', expired: false })).toBe('cancel')
    expect(swapAction({ status: 'pending_lead', role: 'lead', expired: false })).toBe('decide')
    expect(swapAction({ status: 'pending_lead', role: 'partner', expired: false })).toBeNull()
    expect(swapAction({ status: 'approved', role: 'lead', expired: false })).toBeNull()
  })

  it('does nothing once the shift has started', () => {
    expect(isOpen({ status: 'pending_lead', expired: true })).toBe(false)
    expect(needsMe({ status: 'pending_lead', role: 'lead', expired: true })).toBe(false)
  })
})

describe('groupOptions', () => {
  const base: Omit<SwapOption, 'partnerId' | 'partnerShift'> = { firstName: 'A', lastName: 'B', avatarPath: null, jobTitle: '', warnings: [] }
  const shift = (id: string) => ({ entryId: id, date: '2026-10-20', startsAt: new Date(), endsAt: new Date(), shiftCode: 'F', shiftName: 'Früh', category: 'early' as const })
  it('groups by colleague with the hand-over separate', () => {
    const g = groupOptions([
      { ...base, partnerId: 'p1', partnerShift: null },
      { ...base, partnerId: 'p1', partnerShift: shift('e1') },
      { ...base, partnerId: 'p2', partnerShift: shift('e2') },
    ])
    expect(g).toHaveLength(2)
    expect(g[0]!.handover).not.toBeNull()
    expect(g[0]!.swaps).toHaveLength(1)
    expect(g[1]!.handover).toBeNull()
  })
})
