import { CalendarCheck, Hand, Sparkles, UserCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError, Stagger } from '@/components/QueryState'
import { errorMessageKey, toAppError } from '@/core/errors'
import { can } from '@/domain/permissions'
import type { CoverShift } from '@/domain/staffing'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonCard, cn, useToast } from '@/ui'
import { CandidatesSheet } from './CandidatesSheet'
import { useInterestMutation, useOpenShiftInterests, useOpenShifts } from './useStaffing'

export function OpenShiftsPage() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const employment = useEmployment()
  const unitIds = useMemo(
    () => [...new Set([...employment.units.map((u) => u.id), ...employment.managedUnitIds])].sort(),
    [employment.units, employment.managedUnitIds],
  )
  const shifts = useOpenShifts(unitIds)
  const entryIds = useMemo(() => (shifts.data ?? []).map((s) => s.entryId), [shifts.data])
  const interests = useOpenShiftInterests(entryIds)
  const interest = useInterestMutation()
  const [staffing, setStaffing] = useState<CoverShift | null>(null)
  const memberOf = new Set(employment.units.map((u) => u.id))
  const canManage = can(employment, 'schedule.manage')

  const toggle = (s: CoverShift, interested: boolean) =>
    interest.mutate(
      { entryId: s.entryId, interested },
      {
        onSuccess: () =>
          toast.show(
            interested
              ? { tone: 'success', title: t('openShifts.interestSent'), description: t('openShifts.interestSentHint') }
              : { tone: 'info', title: t('openShifts.interestWithdrawn') },
          ),
        onError: (e) =>
          toast.show({ tone: 'error', title: t('errors.title'), description: toAppError(e).kind === 'conflict' ? t('openShifts.overlap') : t(errorMessageKey(e)) }),
      },
    )

  return (
    <>
      <PageHeader title={t('openShifts.title')} subtitle={t('openShifts.subtitle')} />

      {shifts.isLoading && <SkeletonCard lines={3} />}
      {shifts.error && <QueryError error={shifts.error} onRetry={() => void shifts.refetch()} />}
      {shifts.data && shifts.data.length === 0 && (
        <Card>
          <EmptyState icon={<Sparkles />} title={t('dashboard.noOpenShifts')} description={t('openShifts.emptyHint')} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(shifts.data ?? []).map((s, i) => {
          const forShift = (interests.data ?? []).filter((x) => x.entryId === s.entryId)
          const mine = forShift.find((x) => x.employeeId === employment.employeeId && x.status === 'pending')
          const pending = forShift.filter((x) => x.status === 'pending')
          const manages = canManage && employment.managedUnitIds.includes(s.unitId)
          return (
            <Stagger key={s.entryId} index={i}>
              <Card padding="sm" className="sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span className={cn('h-12 w-1.5 shrink-0 rounded-full', dayKindStyles[s.category ?? 'other'].solid)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold">
                      {s.shiftName ?? s.shiftCode} · {fmt.dateShort(s.date)}
                    </p>
                    <p className="text-sm text-text-2 tabular">
                      {fmt.timeRange(s.startsAt, s.endsAt)} · {s.unitName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mine && <Badge tone="accent">{t('openShifts.youVolunteered')}</Badge>}
                      {manages && (
                        <Badge tone={pending.length ? 'success' : 'neutral'}>
                          <Users className="mr-1 size-3.5" aria-hidden />
                          {t('openShifts.interestCount', { count: pending.length })}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {memberOf.has(s.unitId) &&
                    (mine ? (
                      <Button size="sm" variant="ghost" loading={interest.isPending && interest.variables?.entryId === s.entryId} onClick={() => toggle(s, false)}>
                        {t('openShifts.withdraw')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={manages ? 'secondary' : 'primary'}
                        icon={<Hand className="size-4" />}
                        loading={interest.isPending && interest.variables?.entryId === s.entryId}
                        onClick={() => toggle(s, true)}
                      >
                        {t('openShifts.volunteer')}
                      </Button>
                    ))}
                  {manages && (
                    <Button size="sm" icon={<UserCheck className="size-4" />} onClick={() => setStaffing(s)}>
                      {t('openShifts.staff')}
                    </Button>
                  )}
                </div>
              </Card>
            </Stagger>
          )
        })}
      </div>

      {shifts.data && shifts.data.length > 0 && (
        <p className="mt-6 flex items-center gap-2 px-1 text-sm text-text-3">
          <CalendarCheck className="size-4" aria-hidden />
          {t('openShifts.howItWorks')}
        </p>
      )}

      <CandidatesSheet shift={staffing} onClose={() => setStaffing(null)} allowRelease={false} />
    </>
  )
}
