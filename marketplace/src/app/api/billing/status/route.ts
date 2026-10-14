import { NextResponse, type NextRequest } from 'next/server'
import { getPayment, settlePayment } from '@/lib/billing/settle'
import { createClient } from '@/lib/supabase/server'

/** The signed-in user's payment status; settles it with Paynow if still pending. */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference') ?? ''
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  const payment = await getPayment(reference)
  if (!payment || payment.user_id !== user.id) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  try {
    return NextResponse.json({ status: await settlePayment(reference) })
  } catch {
    return NextResponse.json({ status: 'pending' })
  }
}
