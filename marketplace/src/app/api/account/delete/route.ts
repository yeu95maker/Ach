import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Deletes the signed-in user's account (GDPR Art. 17). Profile, listings,
 * favourites, messages etc. are removed by the database cascades; payment
 * records are kept without the link to the person (accounting duties).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: string }
  if (body.confirm !== 'DELETE') return NextResponse.json({ error: 'CONFIRMATION_REQUIRED' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 })
  await supabase.auth.signOut().catch(() => {})
  return NextResponse.json({ deleted: true })
}
