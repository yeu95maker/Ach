#!/usr/bin/env node
/**
 * Marketplace local test gateway – NOT for production.
 *
 * A tiny stand-in for the Supabase API (Auth + PostgREST subset) on top of a
 * plain PostgreSQL that was prepared with scripts/db-test.sh. Every data
 * request runs as role `authenticated` with the caller's JWT claims, exactly
 * like PostgREST does – so Row Level Security is exercised for real.
 *
 * Used for browser end-to-end checks where Docker / the Supabase CLI are not
 * available. Supports only what the marketplace client uses.
 *
 *   PGHOST=/tmp PGPORT=5432 PGDATABASE=marketplace_test node scripts/e2e/gateway.mjs
 */
import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.GATEWAY_PORT ?? 54321)
const SECRET = 'local-test-secret-not-for-production'
// Like PostgREST: DATE columns are returned as 'YYYY-MM-DD' strings.
pg.types.setTypeParser(1082, (v) => v)
const pool = new pg.Pool({ database: process.env.PGDATABASE ?? 'marketplace_test', max: 10 })

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

/** `.single()` / `.maybeSingle()` ask for one object instead of an array (like PostgREST). */
const wantsObject = (req) => (req.headers.accept ?? '').includes('application/vnd.pgrst.object+json')

async function handleRest(req, res, url, claims) {
  const path = url.pathname.replace(/^\/rest\/v1\//, '')
  const params = [...url.searchParams.entries()]

  if (path.startsWith('rpc/')) {
    const fn = ident(path.slice(4))
    const args = (await readBody(req)) ?? {}
    // Like PostgREST: json/jsonb parameters get JSON, everything else the plain value (arrays → PostgreSQL arrays).
    const types = await pool.query(`select a.name, format_type(a.type, null) as type
                                    from pg_proc p, unnest(p.proargnames, p.proargtypes::oid[]) a(name, type)
                                    where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn.replaceAll('"', '')])
    const jsonArg = new Set(types.rows.filter((r) => r.type === 'jsonb' || r.type === 'json').map((r) => r.name))
    const values = []
    const named = Object.entries(args).map(([k, v]) => {
      values.push(v !== null && (jsonArg.has(k) || (typeof v === 'object' && !Array.isArray(v))) ? JSON.stringify(v) : v)
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
    if (wantsObject(req)) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: 'PGRST116', message: `${rows.length} rows` })
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
    if (returning && wantsObject(req)) return inserted.length === 1 ? send(res, 201, inserted[0]) : send(res, 406, { code: 'PGRST116', message: `${inserted.length} rows` })
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
  if (route === '/signup' && req.method === 'POST') {
    const body = await readBody(req)
    const exists = await pool.query('select 1 from auth.users where lower(email) = lower($1)', [body.email])
    if (exists.rowCount) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' })
    const id = randomUUID()
    await pool.query(
      `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf')), now(), $4)`,
      [id, body.email, body.password, JSON.stringify(body.data ?? {})],
    )
    return send(res, 200, await sessionFor(id))
  }
  if (route === '/logout') return send(res, 204, undefined)
  if (route === '/recover') return send(res, 200, {})
  return send(res, 404, { msg: `auth route ${route} not implemented in test gateway` })
}

// ------------------------------------------------------------ Storage ----
// Only metadata is kept (storage.objects); the storage RLS policies decide.
const objectPath = (url, prefix) => {
  const rest = decodeURIComponent(url.pathname.slice(prefix.length))
  const i = rest.indexOf('/')
  return { bucket: rest.slice(0, i), name: rest.slice(i + 1) }
}

const files = new Map()
async function handleUpload(req, res, url, claims) {
  const chunks = []
  await new Promise((resolve) => { req.on('data', (c) => chunks.push(c)); req.on('end', resolve) })
  const { bucket, name } = objectPath(url, '/storage/v1/object/')
  const row = await asUser(claims, async (c) =>
    (await c.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3) returning id', [bucket, name, claims?.sub ?? null])).rows[0])
  let body = Buffer.concat(chunks)
  let type = req.headers['content-type'] ?? 'application/octet-stream'
  // storage-js sends Blobs as multipart/form-data: keep only the file part.
  const boundary = /boundary=(.+)$/.exec(type)?.[1]
  if (boundary) {
    for (const part of body.toString('latin1').split(`--${boundary}`)) {
      const head = part.indexOf('\r\n\r\n')
      if (head < 0 || !/filename=/.test(part.slice(0, head))) continue
      type = /content-type:\s*([^\r\n]+)/i.exec(part.slice(0, head))?.[1] ?? 'application/octet-stream'
      body = Buffer.from(part.slice(head + 4, part.length - 2), 'latin1')
    }
  }
  files.set(`${bucket}/${name}`, { body, type })
  return send(res, 200, { Id: row.id, Key: `${bucket}/${name}` })
}

async function handleSign(req, res, url, claims) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' })
    return res.end('Pulshift test file')
  }
  const body = await readBody(req)
  if (body?.paths) return send(res, 200, body.paths.map((p) => ({ path: p, signedURL: null, error: 'not available in test gateway' })))
  const { bucket, name } = objectPath(url, '/storage/v1/object/sign/')
  const visible = await asUser(claims, async (c) =>
    (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount > 0)
  if (!visible) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
  return send(res, 200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=test` })
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
    if (url.pathname.startsWith('/storage/v1/object/public/')) {
      const file = files.get(decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length)))
      if (!file) return send(res, 404, { message: 'not found' })
      res.writeHead(200, { 'content-type': file.type, 'access-control-allow-origin': '*' })
      return res.end(file.body)
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return await handleSign(req, res, url, claims)
    if (url.pathname.startsWith('/storage/v1/object/') && req.method === 'POST') return await handleUpload(req, res, url, claims)
    return send(res, 404, { message: 'not found' })
  } catch (e) {
    const [status, body] = pgError(e)
    if (process.env.GATEWAY_DEBUG) console.error(req.method, url.pathname, url.search, e.message)
    return send(res, status, body)
  }
}).listen(PORT, () => console.log(`test gateway on http://127.0.0.1:${PORT}`))
