import { AlertTriangle, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { fromISODate } from '@/domain/dates'
import type { ISODate, RosterEntry } from '@/domain/types'
import { compareWithPlan } from '@/domain/wishes'
import type { WishOverviewItem } from '@/data/wishRepository'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { cn } from '@/ui'
import { WishIcon, WishStatusDot, wishStyles } from './wishStyles'

export interface MatrixRow {
  employeeId: string
  firstName: string
  lastName: string
  avatarPath: string | null
  unitName: string
  submitted: boolean
  wishes: Map<ISODate, WishOverviewItem>
  planned: Map<ISODate, RosterEntry>
}

/**
 * Employees × days. Each cell shows the WISH (coloured) and, separately below,
 * what is PLANNED in the roster (neutral code). Contradictions are flagged.
 */
export function WishMatrix({ days, rows, today, onSelect }: { days: ISODate[]; rows: MatrixRow[]; today: ISODate; onSelect: (w: WishOverviewItem) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border/70 bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-48 border-b border-border/70 bg-surface px-4 py-3 text-left text-xs font-semibold text-text-3 uppercase">
                {t('wishes.employee')}
              </th>
              {days.map((d) => {
                const weekend = [0, 6].includes(fromISODate(d).getDay())
                return (
                  <th key={d} scope="col" className={cn('w-11 min-w-11 border-b border-border/70 px-0.5 py-2 text-center font-semibold', weekend && 'bg-surface-2/60', d === today && 'text-primary-text')}>
                    <span className="block text-[11px] text-text-3 uppercase">{fmt.weekdayNarrow(d)}</span>
                    <span className="block tabular">{fmt.dayNumber(d)}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <th scope="row" className="sticky left-0 z-10 border-b border-border/50 bg-surface px-4 py-2 text-left font-normal">
                  <div className="flex items-center gap-2.5">
                    <PersonAvatar person={r} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{`${r.firstName} ${r.lastName}`}</p>
                      <p className="truncate text-xs text-text-3">{r.submitted ? r.unitName : t('wishes.notSubmitted')}</p>
                    </div>
                  </div>
                </th>
                {days.map((d) => {
                  const wish = r.wishes.get(d)
                  const plan = r.planned.get(d)
                  const weekend = [0, 6].includes(fromISODate(d).getDay())
                  const match = wish
                    ? compareWithPlan(wish, plan ? { kind: plan.kind, category: plan.shiftType?.category ?? null, shiftTypeId: plan.shiftType?.id ?? null } : null)
                    : null
                  return (
                    <td key={d} className={cn('border-b border-border/50 p-0.5 text-center align-top', weekend && 'bg-surface-2/40')}>
                      <div className="flex flex-col items-center gap-0.5 py-0.5">
                        {wish ? (
                          <button
                            type="button"
                            onClick={() => onSelect(wish)}
                            aria-label={`${r.firstName} ${r.lastName}, ${fmt.dateShort(d)}: ${t(`wishType.${wish.type}`)}`}
                            className={cn(
                              'relative flex size-9 items-center justify-center rounded-xl transition-transform hover:scale-105',
                              wishStyles[wish.type].soft,
                              wishStyles[wish.type].text,
                              match === 'mismatch' && 'ring-2 ring-danger',
                            )}
                          >
                            <WishIcon type={wish.type} />
                            {wish.note && <span className="absolute top-1 left-1 size-1.5 rounded-full bg-current opacity-60" aria-hidden />}
                            <WishStatusDot status={wish.status} className="absolute -top-1 -right-1 scale-90" />
                          </button>
                        ) : (
                          <span className="size-9" aria-hidden />
                        )}
                        <span
                          className={cn(
                            'flex h-5 min-w-7 items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-semibold',
                            plan ? 'border border-border-strong text-text-2' : 'text-transparent',
                            plan?.scheduleStatus === 'draft' && 'border-dashed',
                          )}
                          title={plan ? t('wishes.plannedTooltip') : undefined}
                        >
                          {plan ? (plan.kind === 'off' ? '–' : (plan.shiftType?.code ?? '•')) : '·'}
                          {match === 'match' && <Check className="size-2.5 text-success" strokeWidth={3} aria-label={t('wishes.match')} />}
                          {match === 'mismatch' && <AlertTriangle className="size-2.5 text-danger" strokeWidth={3} aria-label={t('wishes.mismatch')} />}
                        </span>
                      </div>
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
