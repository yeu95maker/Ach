/**
 * roster-sync – Dienstwerk-Import-Schnittstelle (Roster Exchange v1).
 *
 *   POST /functions/v1/roster-sync
 *   Authorization: Bearer pls_…   (API key of an import profile, Verwaltung → Integrationen)
 *   Content-Type: application/json
 *   { "unit": "3A", "period": {"start": "2026-11-01", "end": "2026-11-30"}, "shifts": [ … ] }
 *
 * Deploy with --no-verify-jwt: senders authenticate with the API key, not a user JWT.
 * The function only validates and forwards; authorisation, mapping and the
 * notification of the ward lead happen in public.ingest_roster().
 * Format and examples: docs/SCHNITTSTELLE.md
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { readApiKey, validateRosterPayload } from '../_shared/rosterPayload.ts'

const MAX_BYTES = 5 * 1024 * 1024
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const key = readApiKey(req.headers)
  if (!key) return json({ error: 'missing_api_key' }, 401)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return json({ error: 'payload_too_large' }, 413)

  let body: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BYTES) return json({ error: 'payload_too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const v = validateRosterPayload(body)
  if (!v.ok) return json({ error: 'invalid_payload', details: v.errors }, 422)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await db.rpc('ingest_roster', { p_key: key, p_payload: v.payload })
  if (error) {
    const status = error.code === '28000' ? 401 : error.code === 'P0429' ? 429 : error.code === '22023' ? 422 : 500
    return json({ error: status === 500 ? 'internal_error' : error.message }, status)
  }
  // staged: waiting for the ward lead · no_changes / unchanged: nothing to do
  return json(data, data?.status === 'staged' ? 202 : 200)
})
