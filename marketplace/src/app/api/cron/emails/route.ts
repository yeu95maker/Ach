import { NextResponse, type NextRequest } from 'next/server'
import { renderEmail, type OutboxRow } from '@/lib/email/render'
import { emailProvider, sendEmail } from '@/lib/email/send'
import { SITE_URL } from '@/lib/seo'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Email worker: sends queued emails from public.email_outbox. Called every few
 * minutes by a scheduler (vercel.json cron, or any cron hitting this URL) with
 * "Authorization: Bearer <CRON_SECRET>".
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!emailProvider()) return NextResponse.json({ skipped: 'EMAIL_PROVIDER not configured' })
  const admin = supabaseAdmin()
  let sent = 0
  let failed = 0
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc('email_outbox_claim', { p_limit: 50 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data as OutboxRow[]) ?? []
    if (!rows.length) break
    for (const row of rows) {
      try {
        if (!row.to) throw new Error('no recipient address')
        await sendEmail(row.to, renderEmail(row, SITE_URL))
        await admin.rpc('email_outbox_mark', { p_id: row.id, p_ok: true, p_error: null })
        sent++
      } catch (e) {
        await admin.rpc('email_outbox_mark', { p_id: row.id, p_ok: false, p_error: e instanceof Error ? e.message : String(e) })
        failed++
      }
    }
  }
  return NextResponse.json({ sent, failed })
}

export const GET = run
export const POST = run
