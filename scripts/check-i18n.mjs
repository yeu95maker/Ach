#!/usr/bin/env node
/**
 * i18n consistency check
 *  1. every locale has exactly the keys of the reference locale (de)
 *  2. every static key used in src/ exists
 *  3. keys built from enums (dayKind.*, leaveType.* …) exist for every value
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const localesDir = join(root, 'src/locales')
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))

const locales = Object.fromEntries(
  readdirSync(localesDir).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), new Set(flatten(JSON.parse(readFileSync(join(localesDir, f), 'utf8'))))]),
)
const ref = locales.de
const errors = []

// i18next plural forms: base key may exist only as key_one / key_other
const hasKey = (set, key) => set.has(key) || set.has(`${key}_one`) || set.has(`${key}_other`)
const pluralBase = (k) => k.replace(/_(zero|one|two|few|many|other)$/, '')
const refBases = new Set([...ref].map(pluralBase))

for (const [lng, keys] of Object.entries(locales)) {
  if (lng === 'de') continue
  const bases = new Set([...keys].map(pluralBase))
  for (const k of refBases) if (!bases.has(k)) errors.push(`[${lng}] missing ${k}`)
  for (const k of bases) if (!refBases.has(k)) errors.push(`[${lng}] unknown ${k}`)
}

const files = []
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|ts)$/.test(f) && !f.endsWith('.test.ts')) files.push(p)
  }
}
walk(join(root, 'src'))

const KEY = /(?:\bt|i18n\.t)\(\s*'([a-zA-Z0-9_.]+)'/g
const LABEL = /(?:labelKey|titleKey):\s*'([a-zA-Z0-9_.]+)'/g
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const re of [KEY, LABEL]) for (const m of src.matchAll(re)) if (!hasKey(ref, m[1])) errors.push(`[de] missing ${m[1]} (used in ${file.replace(root, '')})`)
}

const dynamic = {
  dayKind: ['early', 'late', 'night', 'day', 'other', 'vacation', 'sick', 'off'],
  leaveType: ['vacation', 'special', 'unpaid', 'training', 'overtime_compensation'],
  requestStatus: ['pending', 'approved', 'rejected', 'cancelled'],
  sickStatus: ['reported', 'acknowledged', 'closed', 'cancelled'],
  proficiency: ['native', 'fluent', 'intermediate', 'basic'],
  errors: ['forbidden', 'conflict', 'validation', 'not_found', 'network', 'auth', 'unknown'],
  'profile.push': ['unsupported', 'not_configured', 'default', 'granted', 'denied'],
}
for (const [prefix, values] of Object.entries(dynamic)) for (const v of values) if (!hasKey(ref, `${prefix}.${v}`)) errors.push(`[de] missing ${prefix}.${v}`)
for (const type of ['schedule_published', 'schedule_changed', 'open_shift', 'leave_requested', 'leave_approved', 'leave_rejected', 'sick_leave_reported', 'sick_leave_updated', 'announcement', 'message'])
  for (const part of ['title', 'body']) if (!hasKey(ref, `notifications.types.${type}.${part}`)) errors.push(`[de] missing notifications.types.${type}.${part}`)

if (errors.length) {
  console.error(errors.join('\n'))
  console.error(`\n✗ ${errors.length} i18n problem(s)`)
  process.exit(1)
}
console.log(`✓ i18n: ${Object.keys(locales).length} locales, ${refBases.size} keys`)
