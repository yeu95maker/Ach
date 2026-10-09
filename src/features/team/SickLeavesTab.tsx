import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Eye, HeartPulse, Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError, Stagger } from '@/components/QueryState'
import { SickLeaveStatusBadge } from '@/components/RequestStatusBadge'
import { errorMessageKey } from '@/core/errors'
import { teamRepository } from '@/data/teamRepository'
import { daysBetweenInclusive } from '@/domain/dates'
import { can } from '@/domain/permissions'
import type { TeamSickLeave } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, EmptyState, SkeletonCard, Spinner, useToast } from '@/ui'

function Comment({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: queryKeys.sickComment(id), queryFn: () => teamRepository.fetchSickLeaveComment(id), staleTime: 0, gcTime: 0 })
  if (isLoading) return <Spinner className="size-4 text-text-3" />
  return (
    <p className="flex items-start gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-sm text-text-2">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-text-3" aria-label={t('sick.encrypted')} />
      {data || t('sick.noComment')}
    </p>
  )
}

function SickCard({ item }: { item: TeamSickLeave }) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showComment, setShowComment] = useState(false)
  const person = item.person ?? { firstName: '?', lastName: '', avatarPath: null, jobTitle: '' }

  const ack = useMutation({
    mutationFn: () => teamRepository.acknowledgeSickLeave(item.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('sick.acknowledgedToast') })
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamSick(employment.hospital.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <Card padding="sm" className="sm:p-5">
      <div className="flex items-start gap-4">
        <PersonAvatar person={person} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="truncate text-[16px] font-semibold">{`${person.firstName} ${person.lastName}`}</p>
            <SickLeaveStatusBadge status={item.status} />
          </div>
          <p className="text-sm text-text-2">{fmt.dateRange(item.startDate, item.endDate)}</p>
          <p className="text-sm text-text-3">
            {t('sick.days', { count: daysBetweenInclusive(item.startDate, item.endDate) })} · {t('sick.reportedAt', { when: fmt.relative(item.createdAt) })}
          </p>
          {showComment && (
            <div className="mt-3">
              <Comment id={item.id} />
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {can(employment, 'sick_leave.view_details') && !showComment && (
          <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setShowComment(true)}>
            {t('sick.showComment')}
          </Button>
        )}
        {item.status === 'reported' && (
          <Button size="sm" icon={<CheckCheck className="size-4" />} loading={ack.isPending} onClick={() => ack.mutate()}>
            {t('sick.acknowledge')}
          </Button>
        )}
      </div>
    </Card>
  )
}

export function SickLeavesTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.teamSick(employment.hospital.id),
    queryFn: () => teamRepository.fetchTeamSickLeaves(employment.hospital.id, employment.employeeId),
  })

  if (isLoading) return <SkeletonCard lines={3} />
  if (error) return <QueryError error={error} onRetry={() => void refetch()} />
  if (!data?.length)
    return (
      <Card>
        <EmptyState icon={<HeartPulse />} title={t('sick.noneInTeam')} />
      </Card>
    )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.map((item, i) => (
        <Stagger key={item.id} index={i}>
          <SickCard item={item} />
        </Stagger>
      ))}
    </div>
  )
}
