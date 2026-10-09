/**
 * invite-employee – onboarding of a new employee by HR / hospital admins.
 *
 * 1. verifies the caller (JWT) holds `employees.manage` hospital-wide and may
 *    grant the requested role (permission subset rule, same as RLS)
 * 2. invites the person via Supabase Auth (or reuses an existing account)
 * 3. creates the employment, ward membership and role assignment
 *
 * POST { hospital_id, email, first_name, last_name, job_title, unit_id?, role_key = 'nurse', locale = 'de' }
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

interface InviteRequest {
  hospital_id: string
  email: string
  first_name: string
  last_name: string
  job_title: string
  unit_id?: string | null
  role_key?: string
  locale?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const input = (await req.json()) as InviteRequest
  const email = input.email?.trim().toLowerCase()
  const roleKey = input.role_key ?? 'nurse'
  if (!input.hospital_id || !email || !/^[^@\s]+@[^@\s]+$/.test(email) || !input.first_name || !input.last_name) {
    return json({ error: 'invalid input' }, 400)
  }

  // 1. Authorisation – evaluated with the caller's own JWT (RLS applies).
  const { data: ctx, error: ctxError } = await caller.rpc('my_context')
  if (ctxError || !ctx) return json({ error: 'unauthorized' }, 401)
  // deno-lint-ignore no-explicit-any
  const employment = (ctx.employments as any[]).find((e) => e.hospital.id === input.hospital_id)
  const permissions = new Set<string>(employment?.permissions ?? [])
  if (!permissions.has('employees.manage') || !permissions.has('roles.assign')) return json({ error: 'forbidden' }, 403)

  const { data: role } = await admin
    .from('roles')
    .select('id, role_permissions(permission_key)')
    .eq('key', roleKey)
    .or(`hospital_id.is.null,hospital_id.eq.${input.hospital_id}`)
    .eq('scope', 'hospital')
    .maybeSingle()
  if (!role) return json({ error: 'unknown role' }, 400)
  // deno-lint-ignore no-explicit-any
  if (!(role.role_permissions as any[]).every((rp) => permissions.has(rp.permission_key))) {
    return json({ error: 'cannot grant a role with permissions you do not hold' }, 403)
  }

  // 2. Account: reuse an existing person (multi-hospital staff) or invite.
  let userId: string | undefined
  const { data: existing } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
  if (existing) {
    userId = existing.id
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: input.first_name, last_name: input.last_name, locale: input.locale ?? 'de' },
      redirectTo: `${Deno.env.get('APP_URL') ?? ''}/reset-password`,
    })
    if (error || !data.user) return json({ error: error?.message ?? 'invite failed' }, 400)
    userId = data.user.id
  }

  // 3. Employment, ward and role (composite FKs guarantee tenant consistency).
  const { data: emp, error: empError } = await admin
    .from('employees')
    .insert({ hospital_id: input.hospital_id, user_id: userId, job_title: input.job_title ?? '' })
    .select('id')
    .single()
  if (empError) return json({ error: empError.message }, empError.code === '23505' ? 409 : 400)

  if (input.unit_id) {
    await admin.from('employee_units').insert({ hospital_id: input.hospital_id, employee_id: emp.id, unit_id: input.unit_id, is_primary: true })
  }
  await admin.from('employee_roles').insert({
    hospital_id: input.hospital_id,
    employee_id: emp.id,
    role_id: role.id,
    unit_id: input.unit_id ?? null,
    granted_by: ctx.user.id,
  })

  return json({ employee_id: emp.id, user_id: userId, invited: !existing }, 201)
})
