import { db, unwrap, unwrapList } from './client'

export interface DeletionRequest {
  id: string
  requestedAt: Date
}

export interface AdminDeletionRequest {
  id: string
  employeeId: string
  name: string
  email: string
  note: string | null
  requestedAt: Date
}

/** Konto-Löschung in der App beantragen (App Store 5.1.1(v), Google Play). */
export const accountRepository = {
  async fetchMyRequest(userId: string): Promise<DeletionRequest | null> {
    const rows = unwrapList<{ id: string; requested_at: string }>(
      await db().from('account_deletion_requests').select('id, requested_at').eq('user_id', userId).eq('status', 'open'),
    )
    return rows[0] ? { id: rows[0].id, requestedAt: new Date(rows[0].requested_at) } : null
  },

  async request(note: string | null): Promise<void> {
    unwrap(await db().rpc('request_account_deletion', { p_note: note }))
  },

  async withdraw(): Promise<void> {
    unwrap(await db().rpc('withdraw_account_deletion'))
  },

  async fetchOpen(hospitalId: string): Promise<AdminDeletionRequest[]> {
    return unwrapList<{ id: string; employee_id: string; first_name: string; last_name: string; email: string; note: string | null; requested_at: string }>(
      await db().rpc('get_account_deletion_requests', { p_hospital_id: hospitalId }),
    ).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      name: `${r.first_name} ${r.last_name}`,
      email: r.email,
      note: r.note,
      requestedAt: new Date(r.requested_at),
    }))
  },

  async complete(id: string, hospitalId: string): Promise<void> {
    unwrap(await db().rpc('complete_account_deletion', { p_request_id: id, p_hospital_id: hospitalId }))
  },
}
