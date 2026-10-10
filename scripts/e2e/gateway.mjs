#!/usr/bin/env node
/**
 * ShiftCare local test gateway – NOT for production.
 *
 * A tiny stand-in for the Supabase API (Auth + PostgREST subset) on top of a
 * plain PostgreSQL that was prepared with scripts/db-test.sh. Every data
 * request runs as role `authenticated` with the caller's JWT claims, exactly
 * like PostgREST does – so Row Level Security is exercised for real.
 *
 * Used for browser end-to-end checks where Docker / the Supabase CLI are not
 * available. Supports only what the ShiftCare client uses.
 *
 *   PGHOST=/tmp PGPORT=5432 PGDATABASE=shiftcare_test node scripts/e2e/gateway.mjs
 */
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.GATEWAY_PORT ?? 54321)
const SECRET = 'local-test-secret-not-for-production'
// Like PostgREST: DATE columns are returned as 'YYYY-MM-DD' strings.
pg.types.setTypeParser(1082, (v) => v)
const pool = new pg.Pool({ database: process.env.PGDATABASE ?? 'shiftcare_test', max: 10 })

// ---------------------------------------------------------------- JWT ----
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
function signJwt(payload) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url(payload)
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
function verifyJwt(token) {
  const [head, body, sig] = (token ?? '').split('.')
  if (!head || !body || !sig) return null
  const expected = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  if (expected !== sig) return null
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  return claims.exp * 1000 > Date.now() ? claims : null
}

async function sessionFor(userId) {
  const { rows } = await pool.query('select id, email, raw_user_meta_data, created_at from auth.users where id = $1', [userId])
  const u = rows[0]
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: randomUUID() }
  return {
    access_token: signJwt(claims),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: Buffer.from(u.id).toString('base64url'),
    user: userObject(u),
  }
}
const userObject = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: u.created_at,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: u.raw_user_meta_data ?? {},
  identities: [],
  created_at: u.created_at,
  updated_at: u.created_at,
})

// ------------------------------------------------------------ helpers ----
const IDENT = /^[a-z_][a-z0-9_]*$/
const ident = (v) => {
  if (!IDENT.test(v)) throw Object.assign(new Error(`invalid identifier ${v}`), { status: 400 })
  return `"${v}"`
}
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'access-control-expose-headers': 'content-range',
    ...headers,
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data ? JSON.parse(data) : null))
  })

/** Run SQL as the PostgREST would: role + JWT claims, inside a transaction. */
async function asUser(claims, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`set local role ${claims ? 'authenticated' : 'anon'}`)
    if (claims) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

// ------------------------------------------------- PostgREST subset ----
function parseSelect(select, table) {
  if (!select || select === '*') return '*'
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of select) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
    .map((p) => {
      const m = p.match(/^([a-z_]+)\(([^)]*)\)$/)
      if (!m) return `t.${ident(p)}`
      // to-one embed via "<singular>_id" foreign key, e.g. units(name) → unit_id
      const [, rel, cols] = m
      const fk = `${rel.replace(/s$/, '')}_id`
      const obj = cols.split(',').map((c) => `'${c.trim()}', r.${ident(c.trim())}`).join(', ')
      return `(select json_build_object(${obj}) from public.${ident(rel)} r where r.id = t.${ident(fk)}) as ${ident(rel)}`
    })
    .join(', ')
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
function parseFilters(params, values) {
  const where = []
  const add = (v) => {
    values.push(v)
    return `$${values.length}`
  }
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue
    const col = ident(key)
    let negate = false
    let expr = raw
    if (expr.startsWith('not.')) {
      negate = true
      expr = expr.slice(4)
    }
    const dot = expr.indexOf('.')
    const op = expr.slice(0, dot)
    const val = expr.slice(dot + 1)
    let sql
    switch (op) {
      case 'eq': sql = `t.${col} = ${add(val)}`; break
      case 'neq': sql = `t.${col} <> ${add(val)}`; break
      case 'gt': sql = `t.${col} > ${add(val)}`; break
      case 'gte': sql = `t.${col} >= ${add(val)}`; break
      case 'lt': sql = `t.${col} < ${add(val)}`; break
      case 'lte': sql = `t.${col} <= ${add(val)}`; break
      case 'is': sql = `t.${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`; break
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
        sql = `t.${col}::text = any(${add(items)}::text[])`
        break
      }
      default:
        throw Object.assign(new Error(`unsupported operator ${op}`), { status: 400 })
    }
    where.push(negate ? `not (${sql})` : sql)
  }
  return where.length ? `where ${where.join(' and ')}` : ''
}

function parseOrder(order) {
  if (!order) return ''
  return (
    'order by ' +
    order
      .split(',')
      .map((part) => {
        const [col, dir = 'asc', nulls] = part.split('.')
        return `t.${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`
      })
      .join(', ')
  )
}

function pgError(e) {
  const status = e.status ?? (e.code === '42501' ? 403 : e.code?.startsWith('23') ? 409 : 400)
  return [status, { code: e.code ?? 'PGRST000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null }]
}

async function handleRest(req, res, url, claims) {
  const path = url.pathname.replace(/^\/rest\/v1\//, '')
  const params = [...url.searchParams.entries()]

  if (path.startsWith('rpc/')) {
    const fn = ident(path.slice(4))
    const args = (await readBody(req)) ?? {}
    const values = []
    const named = Object.entries(args).map(([k, v]) => {
      // objects and arrays of objects are JSON; arrays of scalars are PostgreSQL arrays (e.g. uuid[])
      const isJson = v !== null && typeof v === 'object' && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === 'object'))
      values.push(isJson ? JSON.stringify(v) : v)
      return `${ident(k)} => $${values.length}`
    })
    // Like PostgREST: set-returning functions answer with an array, others with a single value.
    const meta = await pool.query(`select bool_or(p.proretset) as retset, bool_or(t.typtype = 'c') as composite
                                   from pg_proc p join pg_type t on t.oid = p.prorettype
                                   where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn.replaceAll('"', '')])
    const call = `public.${fn}(${named.join(', ')})`
    if (meta.rows[0]?.retset) {
      const result = await asUser(claims, (c) => c.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]') as r from ${call} x`, values))
      return send(res, 200, result.rows[0].r)
    }
    if (meta.rows[0]?.composite) {
      const result = await asUser(claims, (c) => c.query(`select case when x is null then null else to_jsonb(x) end as r from ${call} x`, values))
      return send(res, 200, result.rows[0]?.r ?? null)
    }
    const result = await asUser(claims, (c) => c.query(`select ${call} as r`, values))
    return send(res, 200, result.rows[0]?.r ?? null)
  }

  const table = ident(path)
  const values = []
  const where = parseFilters(params, values)

  if (req.method === 'GET' || req.method === 'HEAD') {
    const prefer = req.headers.prefer ?? ''
    const limit = url.searchParams.get('limit')
    const sql = `select ${parseSelect(url.searchParams.get('select'), path)} from public.${table} t ${where} ${parseOrder(url.searchParams.get('order'))} ${limit ? `limit ${Number(limit)}` : ''}`
    if (req.method === 'HEAD' || prefer.includes('count=exact')) {
      const { rows } = await asUser(claims, (c) => c.query(`select count(*)::int as n from public.${table} t ${where}`, values))
      if (req.method === 'HEAD') return send(res, 200, undefined, { 'content-range': `*/${rows[0].n}` })
    }
    const { rows } = await asUser(claims, (c) => c.query(sql, values))
    return send(res, 200, rows, { 'content-range': `0-${rows.length - 1}/*` })
  }

  if (req.method === 'POST') {
    const body = await readBody(req)
    const list = Array.isArray(body) ? body : [body]
    const upsert = (req.headers.prefer ?? '').includes('merge-duplicates')
    const returning = url.searchParams.get('select')
    const inserted = []
    await asUser(claims, async (c) => {
      for (const row of list) {
        const cols = Object.keys(row)
        const vals = cols.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]))
        const conflict = upsert
          ? `on conflict on constraint ${ident(`${path}_pkey`)} do update set ${cols.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`
          : ''
        // Embeds in the returned representation ("…, units(name)") are resolved with a follow-up select.
        const embeds = !!returning?.includes('(')
        const ret = !returning ? '' : embeds ? 'returning id' : `returning ${returning.split(',').map((c) => ident(c.trim())).join(', ')}`
        const r = await c.query(`insert into public.${table} (${cols.map(ident).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ${conflict} ${ret}`, vals)
        if (embeds) {
          const again = await c.query(`select ${parseSelect(returning, path)} from public.${table} t where t.id = any($1)`, [r.rows.map((x) => x.id)])
          inserted.push(...again.rows)
        } else inserted.push(...r.rows)
      }
    })
    return returning ? send(res, 201, inserted) : send(res, 201, undefined)
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req)
    const cols = Object.keys(body)
    const offset = values.length
    const set = cols.map((k, i) => `${ident(k)} = $${offset + i + 1}`).join(', ')
    await asUser(claims, (c) => c.query(`update public.${table} t set ${set} ${where}`, [...values, ...cols.map((k) => body[k])]))
    return send(res, 204, undefined)
  }

  if (req.method === 'DELETE') {
    await asUser(claims, (c) => c.query(`delete from public.${table} t ${where}`, values))
    return send(res, 204, undefined)
  }
  return send(res, 405, { message: 'method not allowed' })
}

// --------------------------------------------------------------- Auth ----
async function handleAuth(req, res, url, claims) {
  const route = url.pathname.replace(/^\/auth\/v1/, '')
  if (route === '/token') {
    const body = await readBody(req)
    const grant = url.searchParams.get('grant_type')
    if (grant === 'password') {
      const { rows } = await pool.query(
        `select id from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`,
        [body.email, body.password],
      )
      if (!rows[0]) return send(res, 400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' })
      return send(res, 200, await sessionFor(rows[0].id))
    }
    if (grant === 'refresh_token') {
      const id = Buffer.from(body.refresh_token, 'base64url').toString()
      return send(res, 200, await sessionFor(id))
    }
  }
  if (route === '/user' && req.method === 'GET') {
    if (!claims) return send(res, 401, { msg: 'invalid JWT' })
    const { rows } = await pool.query('select id, email, raw_user_meta_data, created_at from auth.users where id = $1', [claims.sub])
    return send(res, 200, userObject(rows[0]))
  }
  if (route === '/user' && req.method === 'PUT') {
    if (!claims) return send(res, 401, { msg: 'invalid JWT' })
    const body = await readBody(req)
    if (body.password) await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1`, [claims.sub, body.password])
    const { rows } = await pool.query('select id, email, raw_user_meta_data, created_at from auth.users where id = $1', [claims.sub])
    return send(res, 200, userObject(rows[0]))
  }
  if (route === '/logout') return send(res, 204, undefined)
  if (route === '/recover') return send(res, 200, {})
  return send(res, 404, { msg: `auth route ${route} not implemented in test gateway` })
}

// ------------------------------------------------------------ Edge Functions ----
/**
 * Emulates supabase/functions/invite-employee: the account is created with
 * service rights, everything else runs as the caller (RLS decides).
 */
async function handleInvite(req, res, claims) {
  if (!claims) return send(res, 401, { error: 'unauthorized' })
  const input = (await readBody(req)) ?? {}
  const email = String(input.email ?? '').trim().toLowerCase()
  if (!input.hospital_id || !/^[^@\s]+@[^@\s]+$/.test(email) || !input.first_name || !input.last_name) return send(res, 400, { error: 'invalid input' })
  const roleKey = input.role_key ?? 'nurse'
  const roles = await asUser(claims, (c) => c.query('select * from public.assignable_roles($1)', [input.hospital_id]))
  const role = roles.rows.find((r) => r.role_key === roleKey)
  if (!role) return send(res, 403, { error: 'cannot grant this role' })

  const existing = await pool.query('select id from public.users where lower(email) = $1', [email])
  let userId = existing.rows[0]?.id
  if (!userId) {
    userId = randomUUID()
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [userId, email, JSON.stringify({ first_name: input.first_name, last_name: input.last_name, locale: input.locale ?? 'de' })],
    )
  }
  const employeeId = await asUser(claims, async (c) => {
    const emp = await c.query('insert into public.employees (hospital_id, user_id, job_title) values ($1, $2, $3) returning id', [input.hospital_id, userId, input.job_title ?? ''])
    const id = emp.rows[0].id
    if (input.unit_id) await c.query('insert into public.employee_units (hospital_id, employee_id, unit_id, is_primary) values ($1, $2, $3, true)', [input.hospital_id, id, input.unit_id])
    await c.query('insert into public.employee_roles (hospital_id, employee_id, role_id, unit_id) values ($1, $2, $3, $4)', [input.hospital_id, id, role.role_id, input.unit_id ?? null])
    return id
  })
  return send(res, 201, { employee_id: employeeId, user_id: userId, invited: !existing.rows.length })
}

// ------------------------------------------------------------ Server ----
createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, undefined)
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  const claims = verifyJwt(token)
  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url, claims)
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url, claims)
    if (url.pathname === '/functions/v1/invite-employee') return await handleInvite(req, res, claims)
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      const body = await readBody(req)
      return send(res, 200, (body?.paths ?? []).map((p) => ({ path: p, signedURL: null, error: 'not available in test gateway' })))
    }
    return send(res, 404, { message: 'not found' })
  } catch (e) {
    const [status, body] = pgError(e)
    if (process.env.GATEWAY_DEBUG) console.error(req.method, url.pathname, url.search, e.message)
    return send(res, status, body)
  }
}).listen(PORT, () => console.log(`test gateway on http://127.0.0.1:${PORT}`))
