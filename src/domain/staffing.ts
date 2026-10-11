import type { ISODate, ShiftCategory } from './types'

/** A shift that needs cover (sick leave) or is open. */
export interface CoverShift {
  entryId: string
  scheduleId: string
  unitId: string
  unitName: string
  date: ISODate
  startsAt: Date
  endsAt: Date
  shiftCode: string | null
  shiftName: string | null
  category: ShiftCategory | null
}

/** One shift type of a ward on one day (get_ward_status). */
export interface WardShiftStatus {
  shiftTypeId: string
  code: string
  name: string
  category: ShiftCategory
  startTime: string
  endTime: string
  planned: number
  open: number
  minStaff: number | null
  targetStaff: number | null
}

/** Stationsstatus: staffing of one ward on one day. */
export interface WardStatus {
  unitId: string
  unitName: string
  date: ISODate
  shifts: WardShiftStatus[]
  sick: number
  /** null when the caller may not see leave on this ward */
  leave: number | null
  openShifts: number
  understaffed: boolean
}

export type WardShiftLevel = 'ok' | 'low' | 'short' | 'none'

/** short = below minimum, low = below target, ok = fine, none = no requirement set. */
export function wardShiftLevel(s: Pick<WardShiftStatus, 'planned' | 'minStaff' | 'targetStaff'>): WardShiftLevel {
  if (s.minStaff == null && s.targetStaff == null) return 'none'
  if (s.minStaff != null && s.planned < s.minStaff) return 'short'
  if (s.targetStaff != null && s.planned < s.targetStaff) return 'low'
  return 'ok'
}

/** Result row of get_shift_candidates(). */
export interface ShiftCandidate {
  employeeId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  available: boolean
  absence: 'vacation' | 'sick' | null
  busyShiftCode: string | null
  plannedOff: boolean
  restOk: boolean
  restBeforeHours: number | null
  restAfterHours: number | null
  wishType: string | null
  interested: boolean
  monthShiftCount: number
  monthMinutes: number
}

export type CandidateFlagTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

export interface CandidateFlag {
  /** i18n key below `staffing.flag.` */
  key: string
  tone: CandidateFlagTone
  values?: Record<string, string | number>
}

/** Explains in a few badges why someone is (not) a good cover. */
export function candidateFlags(c: ShiftCandidate): CandidateFlag[] {
  const flags: CandidateFlag[] = []
  if (c.interested) flags.push({ key: 'interested', tone: 'accent' })
  if (c.absence) return [...flags, { key: c.absence, tone: 'danger' }]
  if (c.busyShiftCode) return [...flags, { key: 'busy', tone: 'danger', values: { code: c.busyShiftCode } }]
  if (c.plannedOff) flags.push({ key: 'plannedOff', tone: 'neutral' })
  if (!c.restOk) {
    const hours = Math.min(c.restBeforeHours ?? Infinity, c.restAfterHours ?? Infinity)
    flags.push({ key: 'restShort', tone: 'warning', values: { hours: Number.isFinite(hours) ? Math.round(hours * 10) / 10 : 0 } })
  }
  if (c.wishType === 'free' || c.wishType === 'unavailable') flags.push({ key: c.wishType === 'free' ? 'wishFree' : 'wishUnavailable', tone: 'warning' })
  if (flags.every((f) => f.tone !== 'warning')) flags.push({ key: 'fits', tone: 'success' })
  return flags
}

/** Available, rest time respected and no wish against it. */
export function isRecommended(c: ShiftCandidate): boolean {
  return c.available && c.restOk && c.wishType !== 'free' && c.wishType !== 'unavailable'
}
