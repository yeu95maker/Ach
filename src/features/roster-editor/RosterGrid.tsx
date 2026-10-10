import { AlertTriangle, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { PersonAvatar } from '@/components/PersonAvatar'
import { fromISODate, isWithin } from '@/domain/dates'
import type { DailyCounts, PlanningIssue } from '@/domain/rosterPlanning'
import type { Absence, ISODate, RosterEntry, ShiftCategory } from '@/domain/types'
import type { Wish } from '@/domain/wishes'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { WishIcon, wishStyles } from '@/features/wishes/wishStyles'
import { cn } from '@/ui'

export interface GridRow {
  employeeId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  jobTitle: string
  entries: Map<ISODate, RosterEntry>
  wishes: Map<ISODate, Wish>
  absences: Absence[]
  issues: Map<ISODate, PlanningIssue[]>
  plannedMinutes: number
}

const SUMMARY: ShiftCategory[] = ['early', 'late', 'night']
const HARD: PlanningIssue[] = ['absence_sick', 'absence_vacation', 'rest_period']

export function RosterGrid({
  days,
  rows,
  openShifts,
  counts,
  required,
  today,
  pending,
  onCell,
  onOpenCell,
  onOpenShift,
}: {
  days: ISODate[]
  rows: GridRow[]
  openShifts: Map<ISODate, RosterEntry[]>
  counts: Map<ISODate, DailyCounts>
  required: (date: ISODate) => Partial<Record<ShiftCategory, number>>
  today: ISODate
  pending: Set<string>
  onCell: (row: GridRow, date: ISODate) => void
  onOpenCell: (date: ISODate) => void
  onOpenShift: (entry: RosterEntry) => void
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const weekend = (d: ISODate) => [0, 6].includes(fromISODate(d).getDay())
  const stickyCell = 'sticky left-0 z-10 border-b border-border/50 bg-surface px-3 py-1.5 text-left font-normal sm:px-4'

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border/70 bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-44 border-b border-border/70 bg-surface px-4 py-3 text-left text-xs font-semibold text-text-3 uppercase">
                {t('wishes.employee')}
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={cn('w-11 min-w-11 border-b border-border/70 px-0.5 py-2 text-center font-semibold', weekend(d) && 'bg-surface-2/60', d === today && 'text-primary-text')}>
                  <span className="block text-[11px] text-text-3 uppercase">{fmt.weekdayNarrow(d)}</span>
                  <span className="block tabular">{fmt.dayNumber(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <th scope="row" className={stickyCell}>
                  <div className="flex items-center gap-2.5">
                    <PersonAvatar person={r} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{`${r.firstName} ${r.lastName}`}</p>
                      <p className="truncate text-xs text-text-3 tabular">{fmt.hours(r.plannedMinutes)}</p>
                    </div>
                  </div>
                </th>
                {days.map((d) => {
                  const entry = r.entries.get(d) ?? null
                  const wish = r.wishes.get(d)
                  const absence = r.absences.find((a) => isWithin(d, a.startDate, a.endDate))
                  const issues = r.issues.get(d) ?? []
                  const hard = issues.some((i) => HARD.includes(i))
                  const cat = entry?.kind === 'shift' ? (entry.shiftType?.category ?? 'other') : null
                  const style = cat ? dayKindStyles[cat] : entry?.kind === 'off' ? dayKindStyles.off : absence ? dayKindStyles[absence.kind] : null
                  const label = [
                    fmt.dateShort(d),
                    entry ? (entry.kind === 'off' ? t('dayKind.off') : entry.shiftType?.name) : t('editor.empty'),
                    wish && `${t('wishes.manage.wish')}: ${t(`wishType.${wish.type}`)}`,
                    absence && t(`dayKind.${absence.kind}`),
                    ...issues.map((i) => t(`editor.issue.${i}`)),
                  ].filter(Boolean).join(' · ')
                  return (
                    <td key={d} className={cn('border-b border-border/50 p-0.5', weekend(d) && 'bg-surface-2/40')}>
                      <button
                        type="button"
                        onClick={() => onCell(r, d)}
                        aria-label={`${r.firstName} ${r.lastName}, ${label}`}
                        title={label}
                        className={cn(
                          'relative flex size-10 items-center justify-center rounded-xl text-[13px] font-bold transition-[transform,opacity] duration-150 active:scale-90',
                          style ? cn(style.soft, style.text) : 'hover:bg-surface-2',
                          !entry && absence && 'opacity-70',
                          issues.length > 0 && (hard ? 'ring-2 ring-danger' : 'ring-2 ring-warning'),
                          pending.has(`${r.employeeId}|${d}`) && 'animate-pulse',
                        )}
                      >
                        {entry ? (entry.kind === 'off' ? '–' : (entry.shiftType?.code ?? '•')) : absence ? (absence.kind === 'sick' ? t('editor.sickShort') : t('editor.vacationShort')) : ''}
                        {wish && (
                          <span className={cn('absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-surface', wishStyles[wish.type].soft, wishStyles[wish.type].text)}>
                            <WishIcon type={wish.type} className="size-2.5" />
                          </span>
                        )}
                        {issues.length > 0 && <AlertTriangle className={cn('absolute bottom-0.5 left-0.5 size-2.5', hard ? 'text-danger' : 'text-warning')} strokeWidth={3} aria-hidden />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Open shifts */}
            <tr>
              <th scope="row" className={cn(stickyCell, 'bg-surface-2/50')}>
                <p className="font-semibold text-text">{t('editor.openShifts')}</p>
                <p className="text-xs text-text-3">{t('editor.openShiftsHint')}</p>
              </th>
              {days.map((d) => (
                <td key={d} className="border-b border-border/50 bg-surface-2/30 p-0.5 align-top">
                  <div className="flex min-h-10 flex-col items-center gap-0.5">
                    {(openShifts.get(d) ?? []).map((e) => (
                      <button key={e.id} type="button" onClick={() => onOpenShift(e)} title={e.shiftType?.name}
                        className={cn('h-6 w-9 rounded-lg border border-dashed text-[11px] font-bold', dayKindStyles[e.shiftType?.category ?? 'other'].text, dayKindStyles[e.shiftType?.category ?? 'other'].border)}>
                        {e.shiftType?.code}
                      </button>
                    ))}
                    <button type="button" onClick={() => onOpenCell(d)} aria-label={t('editor.addOpenShift', { date: fmt.dateShort(d) })}
                      className="flex h-6 w-9 items-center justify-center rounded-lg text-text-3 hover:bg-surface-3">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </td>
              ))}
            </tr>

            {/* Staffing per day */}
            {SUMMARY.map((cat) => (
              <tr key={cat}>
                <th scope="row" className={cn(stickyCell, 'py-1')}>
                  <span className={cn('inline-flex items-center gap-2 text-xs font-semibold', dayKindStyles[cat].text)}>
                    <span className={cn('size-2 rounded-full', dayKindStyles[cat].dot)} aria-hidden />
                    {t(`dayKind.${cat}`)}
                  </span>
                </th>
                {days.map((d) => {
                  const n = counts.get(d)?.[cat] ?? 0
                  const min = required(d)[cat]
                  const short = min !== undefined && n < min
                  return (
                    <td key={d} className={cn('border-b border-border/50 py-1 text-center text-xs font-semibold tabular', short ? 'bg-danger-soft text-danger-text' : 'text-text-2')}
                      title={min !== undefined ? t('editor.staffingTooltip', { count: n, min }) : undefined}>
                      {n}
                      {min !== undefined && <span className="font-normal opacity-70">/{min}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
