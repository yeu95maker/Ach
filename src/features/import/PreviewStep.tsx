import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarCog, CheckCircle2, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { integrationRepository, type ImportChange, type ImportRun } from '@/data/integrationRepository'
import { scheduleRepository } from '@/data/scheduleRepository'
import { can } from '@/domain/permissions'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, ButtonLink, Card, CardHeader, SkeletonCard, cn, useToast } from '@/ui'
import { importKeys, useRefreshImport, useWardMembers } from './useImport'

function Side({ s }: { s: ImportChange['old'] }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  if (!s) return <span className="text-text-3">–</span>
  if (s.kind === 'off') return <span>{t('dayKind.off')}</span>
  return (
    <span className="tabular">
      <span className="font-semibold">{s.code}</span>
      {s.startsAt && s.endsAt && <span className="text-text-2"> {fmt.timeRange(s.startsAt, s.endsAt)}</span>}
    </span>
  )
}

const CHANGE_TONE = { added: 'success', changed: 'warning', removed: 'danger' } as const

export function PreviewStep({ run, onBack, onDone }: { run: ImportRun; onBack: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const employment = useEmployment()
  const refresh = useRefreshImport()
  const members = useWardMembers(run.unitId)
  const preview = useQuery({ queryKey: importKeys.preview(run.id), queryFn: () => integrationRepository.preview(run.id), enabled: run.status === 'staged' })
  const [applied, setApplied] = useState<ImportRun | null>(run.status === 'applied' ? run : null)
  const [published, setPublished] = useState(run.status === 'published')
  const name = (id: string | null) => {
    const m = members.data?.find((x) => x.employeeId === id)
    return m ? `${m.firstName} ${m.lastName}` : '–'
  }

  const apply = useMutation({
    mutationFn: () => integrationRepository.apply(run.id),
    onSuccess: (r) => {
      void refresh(run.id)
      if (r.status === 'applied') {
        setApplied(r)
        toast.show({ tone: 'success', title: t('integration.preview.applied') })
      } else if (r.status === 'superseded') {
        toast.show({ tone: 'warning', title: t('integration.preview.superseded') })
      } else if (r.errorMessage) {
        toast.show({ tone: 'error', title: t('integration.preview.applyFailed'), description: t('integration.preview.applyFailedHint') })
      }
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const publish = useMutation({
    mutationFn: () => scheduleRepository.publishSchedule(applied!.scheduleId!),
    onSuccess: () => {
      setPublished(true)
      void refresh(run.id)
      toast.show({ tone: 'success', title: t('integration.preview.published'), description: t('integration.preview.publishedHint') })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  if (applied) {
    const d = applied.summary.diff
    return (
      <Card padding="lg" className="space-y-5 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <div>
          <h2 className="text-xl font-semibold">{published ? t('integration.preview.published') : t('integration.preview.applied')}</h2>
          {d && <p className="mt-1 text-text-2">{t('integration.preview.diffLine', d)}</p>}
          <p className="mt-2 text-sm text-text-3">{published ? t('integration.preview.publishedHint') : t('integration.preview.notYetPublished')}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to={`/schedule/plan?unit=${run.unitId}&month=${run.periodStart.slice(0, 7)}`} variant="secondary" icon={<CalendarCog className="size-[18px]" />}>
            {t('integration.preview.openEditor')}
          </ButtonLink>
          {!published && can(employment, 'schedule.publish') && (
            <Button icon={<Send className="size-[18px]" />} loading={publish.isPending} onClick={() => publish.mutate()}>
              {t('integration.preview.publish')}
            </Button>
          )}
          {published && <Button onClick={onDone}>{t('integration.preview.newImport')}</Button>}
        </div>
      </Card>
    )
  }

  if (preview.isLoading) return <SkeletonCard lines={5} />
  if (preview.error) {
    return (
      <Card>
        <p className="text-danger-text">{t(errorMessageKey(preview.error))}</p>
        <p className="mt-1 text-sm text-text-2">{(preview.error as Error).message}</p>
        <Button variant="ghost" className="mt-3" onClick={onBack}>
          {t('common.previous')}
        </Button>
      </Card>
    )
  }
  const p = preview.data!
  const total = p.counts.added + p.counts.changed + p.counts.removed

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={t('integration.preview.title')}
          subtitle={
            p.schedule
              ? t(p.schedule.status === 'published' ? 'integration.preview.intoPublished' : 'integration.preview.intoDraft', { version: p.schedule.version })
              : t('integration.preview.newRoster')
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['added', 'changed', 'removed', 'unchanged'] as const).map((k) => (
            <div key={k} className="rounded-2xl bg-surface-2/70 px-4 py-3">
              <p className="text-2xl font-bold tabular">{p.counts[k]}</p>
              <p className="text-sm text-text-2">{t(`integration.preview.count.${k}`)}</p>
            </div>
          ))}
        </div>
        {p.counts.removed > 0 && p.counts.removed > (p.counts.removed + p.counts.changed + p.counts.unchanged) / 2 && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger-text" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('integration.preview.mostlyRemoved', { count: p.counts.removed })}
          </p>
        )}
        {p.counts.manual > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('integration.preview.manual', { count: p.counts.manual })}
          </p>
        )}
        {p.schedule?.status === 'published' && total > 0 && <p className="mt-3 text-sm text-text-2">{t('integration.preview.notifyHint')}</p>}
      </Card>

      {total > 0 && (
        <Card padding="none">
          <ul className="divide-y divide-border/70">
            {p.changes.slice(0, 200).map((c, i) => (
              <li key={i} className="grid grid-cols-[88px_1fr] gap-3 px-4 py-3 text-sm sm:grid-cols-[110px_180px_1fr] sm:px-5">
                <span className="font-medium">{fmt.dateShort(c.date)}</span>
                <span className="truncate">{name(c.employeeId)}</span>
                <span className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                  <Badge tone={CHANGE_TONE[c.change]}>{t(`integration.preview.change.${c.change}`)}</Badge>
                  {c.change !== 'added' && <Side s={c.old} />}
                  {c.change === 'changed' && <span className="text-text-3">→</span>}
                  {c.change !== 'removed' && <Side s={c.new} />}
                  {c.manual && <Badge tone="warning">{t('integration.preview.manualBadge')}</Badge>}
                </span>
              </li>
            ))}
          </ul>
          {p.changes.length > 200 && <p className={cn('px-5 py-3 text-sm text-text-3')}>{t('integration.preview.more', { count: p.changes.length - 200 })}</p>}
        </Card>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          {t('common.previous')}
        </Button>
        <Button loading={apply.isPending} onClick={() => apply.mutate()}>
          {total > 0 ? t('integration.preview.apply', { count: total }) : t('integration.preview.applyUnchanged')}
        </Button>
      </div>
    </div>
  )
}
