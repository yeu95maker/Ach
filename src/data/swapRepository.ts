import type { ShiftCategory } from '@/domain/types'
import type { ShiftSwap, SwapOption, SwapRole, SwapStatus } from '@/domain/swaps'
import { db, unwrap, unwrapList } from './client'

interface SwapRow {
  id: string
  status: SwapStatus
  role: SwapRole
  expired: boolean
  unit_id: string
  unit_name: string
  note: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
  requester_id: string
  requester_name: string
  partner_id: string
  partner_name: string
  entry_date: string
  starts_at: string
  ends_at: string
  shift_name: string | null
  shift_category: ShiftCategory | null
  partner_entry_id: string | null
  partner_entry_date: string | null
  partner_starts_at: string | null
  partner_ends_at: string | null
  partner_shift_name: string | null
  partner_shift_category: ShiftCategory | null
  warnings: string[] | null
}

interface OptionRow {
  partner_id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  job_title: string
  partner_entry_id: string | null
  entry_date: string | null
  starts_at: string | null
  ends_at: string | null
  shift_code: string | null
  shift_name: string | null
  shift_category: ShiftCategory | null
  warnings: string[] | null
}

export const swapRepository = {
  async fetchSwaps(): Promise<ShiftSwap[]> {
    const rows = unwrapList<SwapRow>(await db().rpc('get_shift_swaps'))
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      role: r.role,
      expired: r.expired,
      unitId: r.unit_id,
      unitName: r.unit_name,
      note: r.note,
      decisionNote: r.decision_note,
      createdAt: new Date(r.created_at),
      decidedAt: r.decided_at ? new Date(r.decided_at) : null,
      requesterId: r.requester_id,
      requesterName: r.requester_name,
      partnerId: r.partner_id,
      partnerName: r.partner_name,
      shift: {
        entryId: '',
        date: r.entry_date,
        startsAt: new Date(r.starts_at),
        endsAt: new Date(r.ends_at),
        shiftName: r.shift_name,
        category: r.shift_category,
      },
      partnerShift:
        r.partner_entry_id && r.partner_entry_date && r.partner_starts_at && r.partner_ends_at
          ? {
              entryId: r.partner_entry_id,
              date: r.partner_entry_date,
              startsAt: new Date(r.partner_starts_at),
              endsAt: new Date(r.partner_ends_at),
              shiftName: r.partner_shift_name,
              category: r.partner_shift_category,
            }
          : null,
      warnings: r.warnings ?? [],
    }))
  },

  async fetchOptions(entryId: string): Promise<SwapOption[]> {
    const rows = unwrapList<OptionRow>(await db().rpc('get_swap_options', { p_entry_id: entryId }))
    return rows.map((r) => ({
      partnerId: r.partner_id,
      firstName: r.first_name,
      lastName: r.last_name,
      avatarPath: r.avatar_path,
      jobTitle: r.job_title,
      partnerShift:
        r.partner_entry_id && r.entry_date && r.starts_at && r.ends_at
          ? {
              entryId: r.partner_entry_id,
              date: r.entry_date,
              startsAt: new Date(r.starts_at),
              endsAt: new Date(r.ends_at),
              shiftCode: r.shift_code,
              shiftName: r.shift_name,
              category: r.shift_category,
            }
          : null,
      warnings: r.warnings ?? [],
    }))
  },

  async request(entryId: string, partnerId: string, partnerEntryId: string | null, note: string | null): Promise<void> {
    unwrap(await db().rpc('request_shift_swap', { p_entry_id: entryId, p_partner_id: partnerId, p_partner_entry_id: partnerEntryId, p_note: note }))
  },

  async respond(id: string, accept: boolean): Promise<void> {
    unwrap(await db().rpc('respond_shift_swap', { p_swap_id: id, p_accept: accept }))
  },

  async decide(id: string, approve: boolean, note: string | null): Promise<void> {
    unwrap(await db().rpc('decide_shift_swap', { p_swap_id: id, p_approve: approve, p_note: note }))
  },

  async cancel(id: string): Promise<void> {
    unwrap(await db().rpc('cancel_shift_swap', { p_swap_id: id }))
  },
}
