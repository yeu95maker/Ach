/**
 * push-dispatch – drains public.notification_deliveries and sends Web Push.
 *
 * Trigger: Supabase Cron (e.g. every minute) or a Database Webhook on INSERT
 * into notification_deliveries. Authenticated with the service-role key
 * (Authorization: Bearer <SERVICE_ROLE_KEY>), never callable by end users.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *  Web:     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
 *  iOS:     APNS_KEY_P8 (AuthKey .p8 contents), APNS_KEY_ID, APNS_TEAM_ID,
 *           APNS_TOPIC (bundle id), APNS_PRODUCTION ('true' for TestFlight/App Store)
 *  Android: FCM_SERVICE_ACCOUNT (Firebase service-account JSON)
 *
 * A channel whose credentials are missing is skipped; its deliveries stay
 * `queued` until it is configured – see docs/APP-STORES.md → Push.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'
import { apnsJwt, fcmAccessToken, sendApns, sendFcm, type ApnsConfig, type FcmServiceAccount, type PushMessage, type SendResult } from '../_shared/nativePush.ts'

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
  open_shift_interest: 'Jemand kann einspringen',
  roster_sync: 'Neuer Dienstplanstand',
  swap_requested: 'Tauschanfrage',
  swap_pending: 'Diensttausch wartet auf Genehmigung',
  swap_declined: 'Tauschanfrage abgelehnt',
  swap_approved: 'Diensttausch genehmigt',
  swap_rejected: 'Diensttausch abgelehnt',
  document_published: 'Neues Dokument',
  document_reminder: 'Bitte Dokument bestätigen',
  training_assigned: 'Neue Pflichtfortbildung',
  training_due: 'Pflichtfortbildung fällig',
  account_deletion_requested: 'Konto-Löschung beantragt',
}

// deno-lint-ignore no-explicit-any
async function sendWeb(device: any, msg: PushMessage): Promise<SendResult> {
  try {
    await webpush.sendNotification({ endpoint: device.token, keys: device.web_push_keys }, JSON.stringify(msg), { TTL: 3600 })
    return { outcome: 'sent' }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    return status === 404 || status === 410 ? { outcome: 'invalid_token', detail: String(status) } : { outcome: 'retry', detail: String(e) }
  }
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ error: 'unauthorized' }, 401)

  const env = (k: string) => Deno.env.get(k) || ''
  const webEnabled = !!(env('VAPID_SUBJECT') && env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'))
  if (webEnabled) webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  const apns: ApnsConfig | null =
    env('APNS_KEY_P8') && env('APNS_KEY_ID') && env('APNS_TEAM_ID') && env('APNS_TOPIC')
      ? { keyP8: env('APNS_KEY_P8'), keyId: env('APNS_KEY_ID'), teamId: env('APNS_TEAM_ID'), topic: env('APNS_TOPIC'), production: env('APNS_PRODUCTION') === 'true' }
      : null
  const fcm: FcmServiceAccount | null = env('FCM_SERVICE_ACCOUNT') ? JSON.parse(env('FCM_SERVICE_ACCOUNT')) : null
  // One provider token per run (APNs accepts it for 60 min, FCM access tokens for 60 min).
  let apnsToken: string | null = null
  let fcmToken: string | null = null

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
    if (!device) continue
    if ((device.platform === 'web' && !webEnabled) || (device.platform === 'ios' && !apns) || (device.platform === 'android' && !fcm)) continue

    // Payload carries no health data: generic title + deep link only.
    const msg: PushMessage = {
      title: TITLES[notification.type] ?? 'Dienstwerk',
      body: typeof notification.payload?.unit_name === 'string' ? notification.payload.unit_name : '',
      url: notification.type.startsWith('schedule') ? '/schedule' : '/notifications',
      tag: notification.type,
    }

    let result: SendResult
    try {
      if (device.platform === 'web') result = await sendWeb(device, msg)
      else if (device.platform === 'ios') result = await sendApns(apns!, device.token, msg, (apnsToken ??= await apnsJwt(apns!)))
      else result = await sendFcm(fcm!.project_id, device.token, msg, (fcmToken ??= await fcmAccessToken(fcm!)))
    } catch (e) {
      result = { outcome: 'retry', detail: String(e) } // e.g. provider credentials rejected
    }

    if (result.outcome === 'sent') {
      await db.from('notification_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq('id', job.id)
      sent++
    } else if (result.outcome === 'invalid_token') {
      // App uninstalled / subscription expired → remove the device (cascades to its deliveries).
      await db.from('device_tokens').delete().eq('id', device.id)
    } else {
      await db
        .from('notification_deliveries')
        .update({ attempts: job.attempts + 1, last_error: result.detail.slice(0, 500), status: job.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued' })
        .eq('id', job.id)
    }
  }
  return json({ processed: jobs?.length ?? 0, sent })
})
