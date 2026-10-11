import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/lib/next'
import { createClient } from '@/lib/supabase/server'

/** Email confirmation / magic link: exchange the code for a session cookie. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(new URL(next, url.origin))
}

