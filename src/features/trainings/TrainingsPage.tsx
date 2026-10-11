import { BadgeCheck, CheckCircle2, GraduationCap, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { QueryError, Stagger } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { STATUS_TONE, overviewMatrix, type MyTraining, type TrainingOverviewRow } from '@/domain/documents'
import { useDocumentScope } from '@/features/documents/useDocuments'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, EmptyState, PageHeader, SegmentedControl, Select, Sheet, SkeletonCard, cn, useToast } from '@/ui'
import { ReportSheet, type ReportTarget } from './ReportSheet'
import { RequirementSheet } from './RequirementSheet'
import { useMyTrainings, useTrainingMutations, useTrainingOverview } from './useTrainings'

function useIntervalText() {
  const { t } = useTranslation()
  return (months: number | null) => (months ? (months % 12 === 0 ? t('trainings.every', { count: months / 12 }) : t('trainings.everyMonths', { count: months })) : t('trainings.once'))
}

function MyTrainingCard({ item, onReport }: { item: MyTraining; onReport: () => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const interval = useIntervalText()
  return (
    <Card padding="sm" className="sm:p-5" data-testid="training-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] leading-snug font-semibold">{item.title}</p>
          <p className="text-sm text-text-3">
            {interval(item.intervalMonths)} · {item.unitName ?? t('documents.wholeHospital')}
          </p>
        </div>
        <Badge tone={STATUS_TONE[item.status]}>{t(`trainings.status.${item.status}`)}</Badge>
      </div>
      {item.description && <p className="mt-2 text-sm text-text-2">{item.description}</p>}
      {item.completedOn && (
        <p className="mt-3 rounded-2xl bg-surface-2/70 px-4 py-2.5 text-sm text-text-2">
          {t('trainings.lastOn', { date: fmt.dateShort(item.completedOn) })}
          {item.validUntil && ` · ${t('trainings.validUntil', { date: fmt.dateShort(item.validUntil) })}`}
          {' · '}
          {item.verified ? t('trainings.verified') : t('trainings.selfReported')}
        </p>
      )}
      {item.status !== 'valid' && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={onReport}>
            {t('trainings.report')}
          </Button>
        </div>
      )}
    </Card>
  )
}

function MyTrainings() {
  const { t } = useTranslation()
  const mine = useMyTrainings()
  const [target, setTarget] = useState<ReportTarget | null>(null)
  return (
    <>
      {mine.isLoading && <SkeletonCard lines={3} />}
      {mine.error && <QueryError error={mine.error} onRetry={() => void mine.refetch()} />}
      {mine.data && mine.data.length === 0 && (
        <Card>
          <EmptyState icon={<GraduationCap />} title={t('trainings.empty')} description={t('trainings.emptyHint')} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(mine.data ?? []).map((item, i) => (
          <Stagger key={item.requirementId} index={i}>
            <MyTrainingCard item={item} onReport={() => setTarget({ requirementId: item.requirementId, title: item.title })} />
          </Stagger>
        ))}
      </div>
      <ReportSheet target={target} onClose={() => setTarget(null)} />
    </>
  )
}

function CellSheet({ cell, onClose, onRecord }: { cell: TrainingOverviewRow | null; onClose: () => void; onRecord: (c: TrainingOverviewRow) => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const m = useTrainingMutations()
  const fail = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })
  return (
    <Sheet open={!!cell} onClose={onClose} closeLabel={t('common.close')} title={cell ? `${cell.firstName} ${cell.lastName}` : ''} description={cell?.title}>
      {cell && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[cell.status]}>{t(`trainings.status.${cell.status}`)}</Badge>
            {cell.completionId && <Badge tone={cell.verified ? 'success' : 'neutral'}>{cell.verified ? t('trainings.verified') : t('trainings.selfReported')}</Badge>}
            {cell.documentId && <Badge tone="primary">{t('trainings.hasCertificate')}</Badge>}
          </div>
          {cell.completedOn && (
            <p className="text-sm text-text-2">
              {t('trainings.lastOn', { date: fmt.dateShort(cell.completedOn) })}
              {cell.validUntil && ` · ${t('trainings.validUntil', { date: fmt.dateShort(cell.validUntil) })}`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {cell.completionId && !cell.verified && (
              <Button
                size="sm"
                icon={<BadgeCheck className="size-4" />}
                loading={m.verify.isPending}
                onClick={() => void m.verify.mutateAsync(cell.completionId!).then(() => { toast.show({ tone: 'success', title: t('trainings.verifiedToast') }); onClose() }, fail)}
              >
                {t('trainings.verify')}
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-4" />} onClick={() => onRecord(cell)}>
              {t('trainings.recordNew')}
            </Button>
            {cell.completionId && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                loading={m.remove.isPending}
                onClick={() => {
                  if (window.confirm(t('trainings.removeConfirm'))) void m.remove.mutateAsync(cell.completionId!).then(onClose, fail)
                }}
              >
                {t('trainings.remove')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function WardOverview() {
  const { t } = useTranslation()
  const scope = useDocumentScope()
  const units = scope.data?.trainingUnits ?? []
  const [unitId, setUnitId] = useState<string | null>(null)
  const active = unitId ?? units[0]?.id ?? null
  const overview = useTrainingOverview(active)
  const matrix = useMemo(() => overviewMatrix(overview.data ?? []), [overview.data])
  const [cell, setCell] = useState<TrainingOverviewRow | null>(null)
  const [record, setRecord] = useState<ReportTarget | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const m = useTrainingMutations()

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {units.length > 1 ? (
          <Select aria-label={t('wardStatus.pickUnit')} value={active ?? ''} onChange={(e) => setUnitId(e.target.value)} className="max-w-xs">
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm font-medium text-text-2">{units[0]?.name}</p>
        )}
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          {t('trainings.new')}
        </Button>
      </div>

      {overview.isLoading && <SkeletonCard lines={4} />}
      {overview.error && <QueryError error={overview.error} onRetry={() => void overview.refetch()} />}
      {overview.data && matrix.requirements.length === 0 && (
        <Card>
          <EmptyState icon={<GraduationCap />} title={t('trainings.noneDefined')} description={t('trainings.noneDefinedHint')} />
        </Card>
      )}

      {matrix.requirements.length > 0 && (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                <th className="sticky left-0 bg-surface px-4 py-3 font-semibold">{t('trainings.person')}</th>
                {matrix.requirements.map((r) => (
                  <th key={r.id} className="px-3 py-3 align-bottom font-semibold">
                    <span className="block">{r.title}</span>
                    <span className="block text-xs font-normal text-text-3">{t('trainings.openCount', { count: r.open })}</span>
                    {!r.hospitalWide && (
                      <button
                        type="button"
                        className="text-xs font-normal text-text-3 underline-offset-2 hover:underline"
                        onClick={() => {
                          if (window.confirm(t('trainings.archiveConfirm', { title: r.title })))
                            void m.archive.mutateAsync(r.id).then(
                              () => toast.show({ tone: 'info', title: t('trainings.archived') }),
                              (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
                            )
                        }}
                      >
                        {t('trainings.archive')}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {matrix.people.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 text-left font-medium">
                    {`${p.firstName} ${p.lastName}`}
                    <span className="block text-xs font-normal text-text-3">{p.jobTitle}</span>
                  </th>
                  {matrix.requirements.map((r) => {
                    const c = p.cells.get(r.id)
                    return (
                      <td key={r.id} className="px-3 py-2.5">
                        {c && (
                          <button
                            type="button"
                            onClick={() => setCell(c)}
                            aria-label={`${p.firstName} ${p.lastName}: ${r.title} – ${t(`trainings.status.${c.status}`)}`}
                            className="rounded-full focus-visible:ring-2"
                          >
                            <Badge tone={STATUS_TONE[c.status]} className={cn(c.completionId && !c.verified && 'ring-1 ring-current/40 ring-dashed')}>
                              {t(`trainings.status.${c.status}`)}
                            </Badge>
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CellSheet
        cell={cell}
        onClose={() => setCell(null)}
        onRecord={(c) => {
          setCell(null)
          setRecord({ requirementId: c.requirementId, title: c.title, employeeId: c.employeeId, employeeName: `${c.firstName} ${c.lastName}` })
        }}
      />
      <ReportSheet target={record} onClose={() => setRecord(null)} />
      <RequirementSheet open={creating} onClose={() => setCreating(false)} defaultUnitId={active} />
    </>
  )
}

export function TrainingsPage() {
  const { t } = useTranslation()
  const scope = useDocumentScope()
  const [params, setParams] = useSearchParams()
  const canManage = !!scope.data && (scope.data.trainingUnits.length > 0 || scope.data.trainingHospital)
  const tab = canManage && params.get('tab') === 'ward' ? 'ward' : 'mine'

  return (
    <>
      <PageHeader
        title={t('trainings.title')}
        subtitle={t('trainings.subtitle')}
        actions={
          canManage ? (
            <SegmentedControl
              label={t('trainings.title')}
              options={[
                { value: 'mine', label: t('trainings.mine') },
                { value: 'ward', label: t('trainings.ward') },
              ]}
              value={tab}
              onChange={(v) => setParams(v === 'ward' ? { tab: 'ward' } : {}, { replace: true })}
              className="w-[240px]"
            />
          ) : undefined
        }
      />
      {tab === 'ward' ? <WardOverview /> : <MyTrainings />}
    </>
  )
}
