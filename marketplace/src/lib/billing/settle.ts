import 'server-only'
import { supabaseAdmin } from '../supabase/admin'
import { poll } from './paynow'
import { FAILED_STATUSES, PAID_STATUSES } from './paynow-protocol'

export type SettleState = 'pending' | 'succeeded' | 'failed'

interface PaymentRow {
  user_id: string
  amount: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  billing_interval: 'month' | 'year'
  poll_url: string | null
}

export async function getPayment(reference: string): Promise<PaymentRow | null> {
  const { data } = await supabaseAdmin().rpc('billing_get_payment', { p_provider: 'paynow', p_reference: reference })
  return (data as PaymentRow | null) ?? null
}

/**
 * Brings a Paynow payment to its final state. Called by the result webhook and
 * by the return page; both are safe to repeat. Paynow's word is always fetched
 * from the poll URL we stored ourselves – never trusted from the request.
 */
export async function settlePayment(reference: string): Promise<SettleState> {
  const admin = supabaseAdmin()
  const payment = await getPayment(reference)
  if (!payment) return 'failed'
  if (payment.status !== 'pending') return payment.status === 'succeeded' ? 'succeeded' : 'failed'
  if (!payment.poll_url) return 'pending'

  const status = await poll(payment.poll_url)
  if (status.reference !== reference) throw new Error('Paynow reference mismatch')

  if (PAID_STATUSES.includes(status.status)) {
    const { error } = await admin.rpc('billing_record_payment', {
      p_user: payment.user_id, p_interval: payment.billing_interval, p_provider: 'paynow', p_reference: reference,
      p_amount: status.amount, p_currency: payment.currency, p_external_customer: null, p_external_subscription: null,
    })
    if (error) throw new Error(error.message)
    await admin.rpc('billing_set_provider_reference', { p_provider: 'paynow', p_reference: reference, p_provider_reference: status.paynowReference })
    return 'succeeded'
  }
  if (FAILED_STATUSES.includes(status.status)) {
    await admin.rpc('billing_fail_payment', { p_provider: 'paynow', p_reference: reference, p_provider_reference: status.paynowReference })
    return 'failed'
  }
  return 'pending'
}
