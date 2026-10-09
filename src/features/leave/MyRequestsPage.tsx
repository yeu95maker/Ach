import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartPulse, Palmtree, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { QueryError, Stagger } from '@/components/QueryState'
import { RequestStatusBadge, SickLeaveStatusBadge } from '@/components/RequestStatusBadge'
import { errorMessageKey } from '@/core/errors'
import { requestsRepository } from '@/data/requestsRepository'
import { countWorkdays } from '@/domain/dates'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, ButtonLink, Card, EmptyState, PageHeader, SectionTitle, SkeletonCard, useToast } from '@/ui'

export function MyRequestsPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const leave = useQuery({
    queryKey: queryKeys.myLeave(employment.employeeId),
    queryFn: () => requestsRepository.fetchMyLeaveRequests(employment.employeeId),
  })
  const sick = useQuery({
    queryKey: queryKeys.mySick(employment.employeeId),
    queryFn: () => requestsRepository.fetchMySickLeaves(employment.employeeId),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => requestsRepository.cancelLeaveRequest(id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('leave.cancelledToast') })
      void queryClient.invalidateQueries({ queryKey: queryKeys.myLeave(employment.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <>
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
        actions={
          <div className="flex gap-2">
            <ButtonLink to="/requests/sick/new" variant="secondary" icon={<HeartPulse className="size-[18px] text-danger" />}>
              <span className="hidden sm:inline">{t('actions.reportSick')}</span>
              <span className="sm:hidden">{t('requests.sickShort')}</span>
            </ButtonLink>
            <ButtonLink to="/requests/leave/new" icon={<Plus className="size-[18px]" />}>
              <span className="hidden sm:inline">{t('actions.requestLeave')}</span>
              <span className="sm:hidden">{t('requests.leaveShort')}</span>
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>{t('requests.leaveSection')}</SectionTitle>
          {leave.isLoading && <SkeletonCard />}
          {leave.error && <QueryError error={leave.error} onRetry={() => void leave.refetch()} />}
          {leave.data?.length === 0 && (
            <Card>
              <EmptyState icon={<Palmtree />} title={t('requests.noLeave')} action={<ButtonLink to="/requests/leave/new" size="sm">{t('actions.requestLeave')}</ButtonLink>} />
            </Card>
          )}
          <div className="space-y-3">
            {leave.data?.map((r, i) => (
              <Stagger key={r.id} index={i}>
                <Card padding="sm" className="sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold">{t(`leaveType.${r.leaveType}`)}</p>
                      <p className="text-sm text-text-2">{fmt.dateRange(r.startDate, r.endDate)}</p>
                      <p className="text-sm text-text-3">{t('leave.workdays', { count: countWorkdays(r.startDate, r.endDate) })}</p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  {r.decisionNote && (
                    <p className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm text-text-2">
                      {t('leave.decisionNote')}: {r.decisionNote}
                    </p>
                  )}
                  {r.status === 'pending' && (
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === r.id} onClick={() => cancel.mutate(r.id)}>
                        {t('leave.cancelRequest')}
                      </Button>
                    </div>
                  )}
                </Card>
              </Stagger>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>{t('requests.sickSection')}</SectionTitle>
          {sick.isLoading && <SkeletonCard />}
          {sick.error && <QueryError error={sick.error} onRetry={() => void sick.refetch()} />}
          {sick.data?.length === 0 && (
            <Card>
              <EmptyState icon={<HeartPulse />} title={t('requests.noSick')} />
            </Card>
          )}
          <div className="space-y-3">
            {sick.data?.map((s, i) => (
              <Stagger key={s.id} index={i}>
                <Card padding="sm" className="flex items-start justify-between gap-3 sm:p-5">
                  <div>
                    <p className="text-[16px] font-semibold">{t('dayKind.sick')}</p>
                    <p className="text-sm text-text-2">{fmt.dateRange(s.startDate, s.endDate)}</p>
                  </div>
                  <SickLeaveStatusBadge status={s.status} />
                </Card>
              </Stagger>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
