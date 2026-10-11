import { Activity, AlertTriangle, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError } from '@/components/QueryState'
import { wardShiftLevel, type WardShiftLevel } from '@/domain/staffing'
import { useWardStatus } from '@/features/staffing/useStaffing'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Card, CardHeader, Skeleton, cn, type Tone } from '@/ui'

const levelTone: Record<WardShiftLevel, Tone> = { ok: 'success', low: 'warning', short: 'danger', none: 'neutral' }

/** Stationsstatus: how today's shifts of my ward are staffed. */
export function WardStatusCard() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const units = employment.units
  const [unitId, setUnitId] = useState(() => (units.find((u) => u.isPrimary) ?? units[0])?.id ?? null)
  const status = useWardStatus(unitId)
  if (!unitId) return null
  const s = status.data

  return (
    <Card>
      <CardHeader
        title={t('wardStatus.title')}
        subtitle={s ? t('wardStatus.subtitle', { unit: s.unitName }) : ' '}
        icon={
          <span className={cn('flex size-10 items-center justify-center rounded-xl', s?.understaffed ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary-text')}>
            {s?.understaffed ? <AlertTriangle className="size-5" /> : <Activity className="size-5" />}
          </span>
        }
      />

      {units.length > 1 && (
        <div className="-mt-1 mb-4 flex flex-wrap gap-2" role="group" aria-label={t('wardStatus.pickUnit')}>
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              aria-pressed={u.id === unitId}
              onClick={() => setUnitId(u.id)}
              className={cn(
                'h-8 rounded-full px-3 text-sm font-medium transition-colors',
                u.id === unitId ? 'bg-primary text-on-primary' : 'bg-surface-2 text-text-2 hover:bg-surface-3',
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}

      {status.isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
      {status.error && <QueryError error={status.error} onRetry={() => void status.refetch()} />}
      {s && (
        <>
          {s.understaffed && (
            <p className="mb-3 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">{t('wardStatus.understaffed')}</p>
          )}
          {s.shifts.length === 0 ? (
            <p className="text-sm text-text-3">{t('wardStatus.noShifts')}</p>
          ) : (
            <ul className="space-y-2">
              {s.shifts.map((x) => {
                const level = wardShiftLevel(x)
                return (
                  <li key={x.shiftTypeId} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-2.5">
                    <span className={cn('h-8 w-1.5 shrink-0 rounded-full', dayKindStyles[x.category].solid)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{x.name}</span>
                      <span className="block text-sm text-text-3 tabular">
                        {x.startTime.slice(0, 5)}–{x.endTime.slice(0, 5)}
                        {x.open > 0 && ` · ${t('wardStatus.open', { count: x.open })}`}
                      </span>
                    </span>
                    <Badge tone={levelTone[level]} className="tabular">
                      {x.minStaff != null || x.targetStaff != null
                        ? t('wardStatus.plannedOf', { planned: x.planned, need: x.targetStaff ?? x.minStaff })
                        : t('wardStatus.planned', { count: x.planned })}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2/70 px-2 py-2.5">
              <dt className="text-xs text-text-3">{t('wardStatus.sick')}</dt>
              <dd className="text-lg font-bold tabular">{s.sick}</dd>
            </div>
            <div className="rounded-2xl bg-surface-2/70 px-2 py-2.5">
              <dt className="text-xs text-text-3">{t('wardStatus.leave')}</dt>
              <dd className="text-lg font-bold tabular">{s.leave ?? '–'}</dd>
            </div>
            <div className="rounded-2xl bg-surface-2/70 px-2 py-2.5">
              <dt className="text-xs text-text-3">{t('wardStatus.openShifts')}</dt>
              <dd className="text-lg font-bold tabular">{s.openShifts}</dd>
            </div>
          </dl>
          {s.openShifts > 0 && (
            <Link to="/schedule/open" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">
              {t('wardStatus.toOpenShifts')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </>
      )}
    </Card>
  )
}
