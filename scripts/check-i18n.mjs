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
  errors: ['forbidden', 'conflict', 'validation', 'not_found', 'rate_limited', 'network', 'auth', 'unknown'],
  'profile.push': ['unsupported', 'not_configured', 'default', 'granted', 'denied'],
  wishType: ['free', 'night', 'early', 'late', 'preferred', 'unavailable'],
  wishTypeShort: ['free', 'night', 'early', 'late', 'preferred', 'unavailable'],
  wishStatus: ['submitted', 'under_review', 'considered', 'not_considered', 'locked'],
  wishPeriodStatus: ['draft', 'open', 'locked', 'archived'],
  'editor.issue': ['absence_vacation', 'absence_sick', 'rest_period', 'wish_conflict'],
  'editor.issueLong': ['absence_vacation', 'absence_sick', 'rest_period', 'wish_conflict'],
  'news.category': ['information', 'training', 'further_education', 'workshop', 'team_meeting', 'doctor_meeting', 'other'],
  'staffing.flag': ['interested', 'vacation', 'sick', 'busy', 'plannedOff', 'restShort', 'wishFree', 'wishUnavailable', 'fits'],
  'staffing.group': ['recommended', 'possible', 'unavailable'],
  'admin.role': ['nurse', 'charge_nurse', 'deputy_head_nurse', 'head_nurse', 'hr', 'hospital_admin'],
  'admin.employmentType': ['full_time', 'part_time', 'marginal', 'trainee', 'agency', 'other'],
  'admin.tabs': ['people', 'organization', 'shifts', 'integrations'],
  'integration.step': ['upload', 'columns', 'review', 'preview'],
  'integration.role': ['employeeId', 'employeeName', 'lastName', 'firstName', 'date', 'code', 'start', 'end', 'break', 'externalShiftId'],
  'integration.parse': ['invalid_date', 'invalid_time', 'invalid_break', 'no_employee', 'too_many_rows'],
  'integration.message': ['empty', 'code_ignored', 'missing_date', 'outside_period', 'employee_unmatched', 'unknown_code', 'invalid_times', 'not_in_unit', 'duplicate_row', 'overlap_in_file', 'off_and_shift'],
  'integration.status': ['staged', 'applied', 'published', 'failed', 'cancelled', 'superseded'],
  'integration.kind': ['file', 'api', 'sftp'],
  'integration.review.count': ['ok', 'warnings', 'errors', 'ignored'],
  'integration.preview.count': ['added', 'changed', 'removed', 'unchanged'],
  'integration.preview.change': ['added', 'changed', 'removed'],
  'integration.adapter': ['csv', 'xlsx'],
  'swaps.status': ['pending_partner', 'pending_lead', 'approved', 'declined', 'rejected', 'cancelled', 'expired'],
  'swaps.warn': ['rest', 'restYou', 'wish', 'wishYou'],
  'documents.category': ['sop', 'guideline', 'checklist', 'form', 'information', 'other'],
  'documents.fileError': ['type', 'size', 'name'],
  'trainings.status': ['missing', 'expired', 'due_soon', 'valid'],
}
for (const [prefix, values] of Object.entries(dynamic)) for (const v of values) if (!hasKey(ref, `${prefix}.${v}`)) errors.push(`[de] missing ${prefix}.${v}`)
for (const type of ['schedule_published', 'schedule_changed', 'open_shift', 'leave_requested', 'leave_approved', 'leave_rejected', 'sick_leave_reported', 'sick_leave_updated', 'announcement', 'message', 'wish_plan_opened', 'wish_plan_deadline', 'wish_plan_submitted', 'wish_plan_locked', 'wish_plan_reviewed', 'open_shift_interest', 'roster_sync', 'swap_requested', 'swap_pending', 'swap_declined', 'swap_approved', 'swap_rejected', 'document_published', 'document_reminder', 'training_assigned', 'training_due'])
  for (const part of ['title', 'body']) if (!hasKey(ref, `notifications.types.${type}.${part}`)) errors.push(`[de] missing notifications.types.${type}.${part}`)

if (errors.length) {
  console.error(errors.join('\n'))
  console.error(`\n✗ ${errors.length} i18n problem(s)`)
  process.exit(1)
}
console.log(`✓ i18n: ${Object.keys(locales).length} locales, ${refBases.size} keys`)
