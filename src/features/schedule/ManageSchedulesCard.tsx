import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { scheduleRepository } from '@/data/scheduleRepository'
import { can } from '@/domain/permissions'
import type { ISODate, ScheduleSummary } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, CardHeader, Sheet, useToast } from '@/ui'

/** Ward managers: see roster status for the visible period and publish drafts. */
export function ManageSchedulesCard({ from, to }: { from: ISODate; to: ISODate }) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ScheduleSummary | null>(null)
  const canPublish = can(employment, 'schedule.publish')

  const { data } = useQuery({
    queryKey: queryKeys.managedSchedules(employment.hospital.id, from, to),
    queryFn: () => scheduleRepository.fetchManagedSchedules(employment.managedUnitIds, from, to),
    enabled: employment.managedUnitIds.length > 0,
  })

  const publish = useMutation({
    mutationFn: (id: string) => scheduleRepository.publishSchedule(id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('schedule.published'), description: t('schedule.publishedHint') })
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['managed-schedules'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rosterAll(employment.employeeId) })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  if (!data?.length) return null

  return (
    <Card>
      <CardHeader
        title={t('schedule.manageTitle')}
        subtitle={t('schedule.manageSubtitle')}
        icon={
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
            <CalendarCheck2 className="size-5" />
          </span>
        }
      />
      <ul className="space-y-2.5">
        {data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{s.unitName}</p>
              <p className="text-sm text-text-3">{fmt.dateRange(s.periodStart, s.periodEnd)}</p>
            </div>
            {s.status === 'published' ? (
              <Badge tone="success" dot>
                {t('schedule.statusPublished', { version: s.version })}
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                {t('schedule.statusDraft')}
              </Badge>
            )}
            {canPublish && (
              <Button size="sm" variant={s.status === 'draft' ? 'primary' : 'secondary'} icon={<Send className="size-4" />} onClick={() => setConfirm(s)}>
                {s.status === 'draft' ? t('schedule.publish') : t('schedule.republish')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        closeLabel={t('common.close')}
        title={t('schedule.publishConfirmTitle')}
        description={confirm ? `${confirm.unitName} · ${fmt.dateRange(confirm.periodStart, confirm.periodEnd)}` : undefined}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" loading={publish.isPending} onClick={() => confirm && publish.mutate(confirm.id)}>
              {t('schedule.publishNow')}
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-text-2">{t('schedule.publishConfirmText')}</p>
      </Sheet>
    </Card>
  )
}
