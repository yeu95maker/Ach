/**
 * push-dispatch – drains public.notification_deliveries and sends Web Push.
 *
 * Trigger: Supabase Cron (e.g. every minute) or a Database Webhook on INSERT
 * into notification_deliveries. Authenticated with the service-role key
 * (Authorization: Bearer <SERVICE_ROLE_KEY>), never callable by end users.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
 *      VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
 *
 * iOS / Android (APNs / FCM) tokens are skipped for now and stay `queued`
 * until the native apps exist – see docs/OPEN_POINTS.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'

const BATCH = 200
const MAX_ATTEMPTS = 5

const TITLES: Record<string, string> = {
  schedule_published: 'Neuer Dienstplan',
  schedule_changed: 'Dienst geändert',
  open_shift: 'Offener Dienst',
  leave_requested: 'Neuer Urlaubsantrag',
  leave_approved: 'Urlaub genehmigt',
  leave_rejected: 'Urlaub abgelehnt',
  sick_leave_reported: 'Neue Krankmeldung',
  sick_leave_updated: 'Krankmeldung aktualisiert',
  announcement: 'Neue Mitteilung',
  message: 'Neue Nachricht',
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ error: 'unauthorized' }, 401)

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } })

  const { data: jobs, error } = await db
    .from('notification_deliveries')
    .select('id, attempts, notification:notifications(type, payload), device:device_tokens(id, platform, token, web_push_keys)')
    .eq('status', 'queued')
    .eq('channel', 'push')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(BATCH)
  if (error) return json({ error: error.message }, 500)

  let sent = 0
  for (const job of jobs ?? []) {
    // deno-lint-ignore no-explicit-any
    const device = job.device as any
    // deno-lint-ignore no-explicit-any
    const notification = job.notification as any
    if (!device || device.platform !== 'web') continue

    // Payload carries no health data: generic title + deep link only.
    const body = JSON.stringify({
      title: TITLES[notification.type] ?? 'ShiftCare',
      body: typeof notification.payload?.unit_name === 'string' ? notification.payload.unit_name : '',
      url: notification.type.startsWith('schedule') ? '/schedule' : '/notifications',
      tag: notification.type,
    })

    try {
      await webpush.sendNotification({ endpoint: device.token, keys: device.web_push_keys }, body, { TTL: 3600 })
      await db.from('notification_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq('id', job.id)
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Subscription expired → remove the device (cascades to its deliveries).
        await db.from('device_tokens').delete().eq('id', device.id)
      } else {
        await db
          .from('notification_deliveries')
          .update({ attempts: job.attempts + 1, last_error: String(e).slice(0, 500), status: job.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued' })
          .eq('id', job.id)
      }
    }
  }
  return json({ processed: jobs?.length ?? 0, sent })
})
