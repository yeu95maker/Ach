import { CalendarPlus, UserCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { candidateFlags, isRecommended, type CoverShift, type ShiftCandidate } from '@/domain/staffing'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, SectionTitle, Sheet, SkeletonCard, useToast } from '@/ui'
import { useAssignShift, useReleaseShift, useShiftCandidates } from './useStaffing'

function CandidateRow({ c, onAssign, busy }: { c: ShiftCandidate; onAssign?: () => void; busy: boolean }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  return (
    <li className="flex items-center gap-3 py-3">
      <PersonAvatar person={c} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{`${c.firstName} ${c.lastName}`}</p>
        <p className="truncate text-xs text-text-3">
          {t('staffing.monthLoad', { count: c.monthShiftCount, hours: fmt.hours(c.monthMinutes) })}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {candidateFlags(c).map((f) => (
            <Badge key={f.key} tone={f.tone}>
              {t(`staffing.flag.${f.key}`, {
                ...f.values,
                ...(typeof f.values?.hours === 'number' ? { hours: new Intl.NumberFormat(fmt.locale).format(f.values.hours) } : {}),
              })}
            </Badge>
          ))}
        </div>
      </div>
      {onAssign && (
        <Button size="sm" variant={isRecommended(c) ? 'primary' : 'secondary'} loading={busy} onClick={onAssign} icon={<UserCheck className="size-4" />}>
          {t('staffing.assign')}
        </Button>
      )}
    </li>
  )
}

/**
 * "Wer kann einspringen?" – candidates for a shift, best first. The lead
 * assigns with one tap or releases the shift as an open shift.
 */
export function CandidatesSheet({ shift, onClose, allowRelease }: { shift: CoverShift | null; onClose: () => void; allowRelease: boolean }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const candidates = useShiftCandidates(shift?.entryId ?? null)
  const assign = useAssignShift()
  const release = useReleaseShift()

  const groups = useMemo(() => {
    const all = candidates.data ?? []
    return {
      recommended: all.filter(isRecommended),
      possible: all.filter((c) => c.available && !isRecommended(c)),
      unavailable: all.filter((c) => !c.available),
    }
  }, [candidates.data])

  const onError = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })

  // mutateAsync instead of per-call callbacks: the roster refetch after success can unmount
  // this sheet (the covered shift leaves the list), and React Query then skips mutate()'s
  // onSuccess – the lead would get no confirmation.
  const doAssign = (c: ShiftCandidate) =>
    shift &&
    assign.mutateAsync({ entryId: shift.entryId, employeeId: c.employeeId }).then(() => {
      toast.show({ tone: 'success', title: t('staffing.assigned', { name: c.firstName }), description: t('staffing.assignedHint') })
      onClose()
    }, onError)

  return (
    <Sheet
      open={!!shift}
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={t('staffing.whoCanCover')}
      description={
        shift ? `${shift.shiftName ?? shift.shiftCode ?? ''} · ${fmt.dateShort(shift.date)} · ${fmt.timeRange(shift.startsAt, shift.endsAt)} · ${shift.unitName}` : undefined
      }
      footer={
        allowRelease ? (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon={<CalendarPlus className="size-[18px]" />}
            loading={release.isPending}
            onClick={() =>
              shift &&
              release.mutateAsync(shift.entryId).then(() => {
                toast.show({ tone: 'success', title: t('staffing.released'), description: t('staffing.releasedHint') })
                onClose()
              }, onError)
            }
          >
            {t('staffing.release')}
          </Button>
        ) : undefined
      }
    >
      {candidates.isLoading && <SkeletonCard lines={4} />}
      {candidates.error && <QueryError error={candidates.error} onRetry={() => void candidates.refetch()} />}
      {candidates.data && (
        <div className="space-y-6">
          {candidates.data.length === 0 && <p className="text-sm text-text-2">{t('staffing.noMembers')}</p>}
          {(
            [
              ['recommended', groups.recommended],
              ['possible', groups.possible],
              ['unavailable', groups.unavailable],
            ] as const
          ).map(([key, list]) =>
            list.length ? (
              <section key={key}>
                <SectionTitle>{t(`staffing.group.${key}`, { count: list.length })}</SectionTitle>
                <ul className="divide-y divide-border/70">
                  {list.map((c) => (
                    <CandidateRow
                      key={c.employeeId}
                      c={c}
                      busy={assign.isPending && assign.variables?.employeeId === c.employeeId}
                      onAssign={c.available ? () => doAssign(c) : undefined}
                    />
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          <p className="text-xs text-text-3">{t('staffing.legalHint')}</p>
        </div>
      )}
    </Sheet>
  )
}
