import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { paymentAdapter } from '@/lib/billing'
import { SUPABASE_URL } from '@/lib/supabase/env'

/**
 * Payment provider webhook. The adapter verifies the signature; the database
 * functions are idempotent per provider reference, so retries are safe.
 */
export async function POST(request: Request) {
  const adapter = paymentAdapter()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adapter || !serviceKey) return NextResponse.json({ error: 'billing_not_configured' }, { status: 501 })

  const event = await adapter.parseWebhook(request)
  if (!event) return NextResponse.json({ ignored: true })

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
  const { error } = event.type === 'payment_succeeded'
    ? await admin.rpc('billing_record_payment', {
        p_user: event.userId, p_interval: event.interval, p_provider: adapter.id, p_reference: event.reference,
        p_amount: event.amount, p_currency: event.currency,
        p_external_customer: event.externalCustomerId ?? null, p_external_subscription: event.externalSubscriptionId ?? null,
      })
    : await admin.rpc('billing_mark_status', { p_user: event.userId, p_status: event.type === 'payment_failed' ? 'past_due' : 'expired' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
