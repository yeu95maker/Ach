import { NextResponse, type NextRequest } from 'next/server'
import { billingMode } from '@/lib/billing'
import { initiate } from '@/lib/billing/paynow'
import { isNativeUserAgent } from '@/lib/native'
import { newReference, normalizeZimPhone } from '@/lib/billing/paynow-protocol'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Starts a Premium payment with Paynow.
 * Body: { interval: 'month'|'year', method: 'web'|'ecocash'|'onemoney', phone?: string, next?: string }
 * → { redirectUrl } (card / Paynow page) or { reference, instructions } (mobile money prompt)
 */
export async function POST(request: NextRequest) {
  if (billingMode() !== 'paynow') return NextResponse.json({ error: 'billing_not_configured' }, { status: 501 })
  // App Store / Play rules: no external payments inside the native apps.
  if (isNativeUserAgent(request.headers.get('user-agent'))) return NextResponse.json({ error: 'not_available_in_app' }, { status: 403 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { interval?: string; method?: string; phone?: string; next?: string }
  const interval = body.interval === 'year' ? 'year' : 'month'
  const method = body.method === 'ecocash' || body.method === 'onemoney' ? body.method : 'web'
  const phone = method === 'web' ? null : normalizeZimPhone(body.phone ?? '')
  if (method !== 'web' && !phone) return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 422 })

  const origin = process.env.APP_URL ?? request.nextUrl.origin
  const next = body.next?.startsWith('/') && !body.next.startsWith('//') ? body.next : '/membership'
  const reference = newReference()
  const admin = supabaseAdmin()
  const { data: started, error } = await admin.rpc('billing_start_payment', {
    p_user: user.id, p_interval: interval, p_provider: 'paynow', p_reference: reference, p_method: method, p_poll_url: null,
  })
  if (error || !started) return NextResponse.json({ error: 'START_FAILED' }, { status: 500 })

  const result = await initiate({
    reference,
    amount: Number((started as { amount: number }).amount),
    description: `StandFinder Premium (${interval === 'year' ? '1 year' : '1 month'})`,
    email: user.email,
    returnUrl: `${origin}/membership/return?reference=${reference}&next=${encodeURIComponent(next)}`,
    resultUrl: `${origin}/api/billing/paynow/result`,
    mobile: phone ? { method: method as 'ecocash' | 'onemoney', phone } : undefined,
  }).catch((e: Error) => ({ ok: false as const, error: e.message }))

  if (!result.ok) {
    await admin.rpc('billing_fail_payment', { p_provider: 'paynow', p_reference: reference, p_provider_reference: null })
    return NextResponse.json({ error: 'PAYNOW_ERROR', message: result.error }, { status: 502 })
  }
  await admin.rpc('billing_set_poll_url', { p_provider: 'paynow', p_reference: reference, p_poll_url: result.pollUrl })
  return NextResponse.json(result.browserUrl ? { reference, redirectUrl: result.browserUrl } : { reference, instructions: result.instructions ?? null })
}
