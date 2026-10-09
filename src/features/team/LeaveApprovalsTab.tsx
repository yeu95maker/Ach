import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError, Stagger } from '@/components/QueryState'
import { RequestStatusBadge } from '@/components/RequestStatusBadge'
import { errorMessageKey } from '@/core/errors'
import { teamRepository } from '@/data/teamRepository'
import { countWorkdays } from '@/domain/dates'
import type { TeamLeaveRequest } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, EmptyState, Field, SectionTitle, Sheet, SkeletonCard, Textarea, useToast } from '@/ui'

function RequestCard({ request, onDecide }: { request: TeamLeaveRequest; onDecide?: (approve: boolean) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const person = request.person ?? { firstName: '?', lastName: '', avatarPath: null, jobTitle: '' }
  return (
    <Card padding="sm" className="sm:p-5">
      <div className="flex items-start gap-4">
        <PersonAvatar person={person} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="truncate text-[16px] font-semibold">{`${person.firstName} ${person.lastName}`}</p>
            <RequestStatusBadge status={request.status} />
          </div>
          <p className="text-sm text-text-2">
            {t(`leaveType.${request.leaveType}`)} · {fmt.dateRange(request.startDate, request.endDate)}
          </p>
          <p className="text-sm text-text-3">{t('leave.workdays', { count: countWorkdays(request.startDate, request.endDate) })}</p>
          {request.comment && <p className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm text-text-2">“{request.comment}”</p>}
          {request.decisionNote && request.status !== 'pending' && (
            <p className="mt-2 text-sm text-text-3">
              {t('leave.decisionNote')}: {request.decisionNote}
            </p>
          )}
        </div>
      </div>
      {onDecide && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" icon={<X className="size-[18px] text-danger" />} onClick={() => onDecide(false)}>
            {t('leave.reject')}
          </Button>
          <Button icon={<Check className="size-[18px]" />} onClick={() => onDecide(true)}>
            {t('leave.approve')}
          </Button>
        </div>
      )}
    </Card>
  )
}

export function LeaveApprovalsTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [decision, setDecision] = useState<{ request: TeamLeaveRequest; approve: boolean } | null>(null)
  const [note, setNote] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.teamLeave(employment.hospital.id),
    queryFn: () => teamRepository.fetchTeamLeaveRequests(employment.hospital.id, employment.employeeId),
  })

  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note: string | null }) => teamRepository.decideLeaveRequest(v.id, v.approve, v.note),
    onSuccess: (_, v) => {
      toast.show({ tone: 'success', title: v.approve ? t('leave.approvedToast') : t('leave.rejectedToast') })
      setDecision(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamLeave(employment.hospital.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const pending = (data ?? []).filter((r) => r.status === 'pending')
  const decided = (data ?? []).filter((r) => r.status !== 'pending').slice(0, 20)

  return (
    <div className="space-y-8">
      {isLoading && <SkeletonCard lines={3} />}
      {error && <QueryError error={error} onRetry={() => void refetch()} />}

      {data && (
        <section>
          <SectionTitle>{t('leave.pendingSection', { count: pending.length })}</SectionTitle>
          {pending.length === 0 ? (
            <Card>
              <EmptyState compact icon={<Inbox />} title={t('leave.noPending')} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.map((r, i) => (
                <Stagger key={r.id} index={i}>
                  <RequestCard request={r} onDecide={(approve) => setDecision({ request: r, approve })} />
                </Stagger>
              ))}
            </div>
          )}
        </section>
      )}

      {decided.length > 0 && (
        <section>
          <SectionTitle>{t('leave.decidedSection')}</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {decided.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      <Sheet
        open={!!decision}
        onClose={() => setDecision(null)}
        closeLabel={t('common.close')}
        title={decision?.approve ? t('leave.approveTitle') : t('leave.rejectTitle')}
        description={decision?.request.person ? `${decision.request.person.firstName} ${decision.request.person.lastName}` : undefined}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setDecision(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="lg"
              variant={decision?.approve ? 'primary' : 'danger'}
              loading={decide.isPending}
              onClick={() => decision && decide.mutate({ id: decision.request.id, approve: decision.approve, note: note.trim() || null })}
            >
              {decision?.approve ? t('leave.approve') : t('leave.reject')}
            </Button>
          </div>
        }
      >
        <Field label={t('leave.noteForEmployee')} htmlFor="decision-note" optional optionalLabel={t('common.optional')}>
          <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('leave.notePlaceholder')} />
        </Field>
      </Sheet>
    </div>
  )
}
