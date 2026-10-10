import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, CircleAlert, Info, RefreshCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { integrationRepository, type ImportMessage, type ImportRow, type ImportRun } from '@/data/integrationRepository'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, CardHeader, SectionTitle, Select, SkeletonCard, useToast } from '@/ui'
import { importKeys, useRefreshImport, useWardMembers, useWardShiftTypes } from './useImport'

export function useMessageText() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  return (m: ImportMessage) =>
    t(`integration.message.${m.code}`, {
      ...m.params,
      from: m.params.from ? fmt.date(m.params.from) : '',
      to: m.params.to ? fmt.date(m.params.to) : '',
    })
}

function EmployeeMapper({ run, refs }: { run: ImportRun; refs: { ref: string; label: string | null; count: number }[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const members = useWardMembers(run.unitId)
  const refresh = useRefreshImport()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const confirm = useMutation({
    mutationFn: async (ref: string) => {
      await integrationRepository.confirmEmployee(run.sourceId, ref, choice[ref]!)
      await integrationRepository.revalidate(run.id)
    },
    onSuccess: () => void refresh(run.id),
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <Card>
      <CardHeader title={t('integration.review.employees', { count: refs.length })} subtitle={t('integration.review.employeesHint')} />
      <ul className="divide-y divide-border/70">
        {refs.map((r) => (
          <li key={r.ref} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{r.label ?? r.ref}</span>
              <span className="block text-sm text-text-3">
                {t('integration.review.idInFile', { id: r.ref })} · {t('integration.review.rows', { count: r.count })}
              </span>
            </span>
            <Select aria-label={t('integration.review.choosePerson', { name: r.label ?? r.ref })} value={choice[r.ref] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [r.ref]: e.target.value }))}>
              <option value="">{t('integration.review.choose')}</option>
              {(members.data ?? []).map((m) => (
                <option key={m.employeeId} value={m.employeeId}>
                  {`${m.lastName}, ${m.firstName}`}
                  {m.jobTitle ? ` · ${m.jobTitle}` : ''}
                </option>
              ))}
            </Select>
            <Button size="sm" disabled={!choice[r.ref]} loading={confirm.isPending && confirm.variables === r.ref} icon={<Check className="size-4" />} onClick={() => confirm.mutate(r.ref)}>
              {t('integration.review.confirm')}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-3">{t('integration.review.noNameMatching')}</p>
    </Card>
  )
}

function CodeMapper({ run, codes }: { run: ImportRun; codes: { code: string; count: number }[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const types = useWardShiftTypes(run.unitId)
  const refresh = useRefreshImport()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const map = useMutation({
    mutationFn: async (code: string) => {
      const v = choice[code]!
      const target = v === 'off' || v === 'ignore' ? v : 'shift'
      await integrationRepository.mapCode(run.sourceId, run.unitId, code, target, target === 'shift' ? v : null)
      await integrationRepository.revalidate(run.id)
    },
    onSuccess: () => void refresh(run.id),
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <Card>
      <CardHeader title={t('integration.review.codes', { count: codes.length })} subtitle={t('integration.review.codesHint')} />
      <ul className="divide-y divide-border/70">
        {codes.map((c) => (
          <li key={c.code} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <span>
              <span className="inline-flex min-w-10 items-center justify-center rounded-lg bg-surface-2 px-2.5 py-1 text-[15px] font-bold">{c.code}</span>
              <span className="ml-3 text-sm text-text-3">{t('integration.review.rows', { count: c.count })}</span>
            </span>
            <Select aria-label={t('integration.review.mapCode', { code: c.code })} value={choice[c.code] ?? ''} onChange={(e) => setChoice((x) => ({ ...x, [c.code]: e.target.value }))}>
              <option value="">{t('integration.review.choose')}</option>
              {(types.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
              <option value="off">{t('dayKind.off')}</option>
              <option value="ignore">{t('integration.review.ignore')}</option>
            </Select>
            <Button size="sm" disabled={!choice[c.code]} loading={map.isPending && map.variables === c.code} icon={<Check className="size-4" />} onClick={() => map.mutate(c.code)}>
              {t('integration.review.confirm')}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-3">{t('integration.review.codesRemembered')}</p>
    </Card>
  )
}

function RowList({ rows, tone }: { rows: ImportRow[]; tone: 'danger' | 'warning' | 'neutral' }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const text = useMessageText()
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, 10)
  return (
    <>
      <ul className="divide-y divide-border/70">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
            <span className="w-20 shrink-0 text-text-3">{t('integration.line', { line: r.line ?? r.rowNo })}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.employeeLabel ?? r.externalEmployeeId ?? '–'}</span>
              {r.date && <span className="text-text-2"> · {fmt.dateShort(r.date)}</span>}
              {r.externalCode && <span className="text-text-2"> · {r.externalCode}</span>}
              <span className="block">
                {r.messages.map((m, i) => (
                  <Badge key={i} tone={tone} className="mt-1 mr-1">
                    {text(m)}
                  </Badge>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 10 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>
          {all ? t('editor.showLess') : t('editor.showAll', { count: rows.length })}
        </Button>
      )}
    </>
  )
}

export function ReviewStep({ runId, onNext, onReupload }: { runId: string; onNext: () => void; onReupload: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshImport()
  const run = useQuery({ queryKey: importKeys.run(runId), queryFn: () => integrationRepository.fetchRun(runId) })
  const rows = useQuery({ queryKey: importKeys.rows(runId), queryFn: () => integrationRepository.fetchRows(runId) })

  const groups = useMemo(() => {
    const list = rows.data ?? []
    const unmatched = new Map<string, { ref: string; label: string | null; count: number }>()
    const codes = new Map<string, { code: string; count: number }>()
    for (const r of list) {
      if (r.status === 'ignored') continue
      if (!r.employeeId && r.externalEmployeeId) {
        const e = unmatched.get(r.externalEmployeeId) ?? { ref: r.externalEmployeeId, label: r.employeeLabel, count: 0 }
        e.count++
        unmatched.set(r.externalEmployeeId, e)
      }
      if (!r.target && r.externalCode) {
        const key = r.externalCode.toLowerCase()
        const c = codes.get(key) ?? { code: r.externalCode, count: 0 }
        c.count++
        codes.set(key, c)
      }
    }
    const fixable = new Set(['employee_unmatched', 'unknown_code'])
    return {
      unmatched: [...unmatched.values()],
      codes: [...codes.values()],
      noId: list.filter((r) => r.status === 'error' && !r.externalEmployeeId && !r.employeeId),
      otherErrors: list.filter((r) => r.status === 'error' && r.messages.some((m) => !fixable.has(m.code))),
      warnings: list.filter((r) => r.status === 'warning'),
      ignored: list.filter((r) => r.status === 'ignored' && r.messages.some((m) => m.code !== 'empty')),
    }
  }, [rows.data])

  if (run.isLoading || rows.isLoading) return <SkeletonCard lines={5} />
  if (!run.data) return null
  const s = run.data.summary
  const errors = s.errors ?? 0

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['ok', s.ok ?? 0, 'text-success-text'],
              ['warnings', s.warnings ?? 0, 'text-warning-text'],
              ['errors', errors, 'text-danger-text'],
              ['ignored', s.ignored ?? 0, 'text-text-2'],
            ] as const
          ).map(([k, n, tone]) => (
            <div key={k} className="rounded-2xl bg-surface-2/70 px-4 py-3">
              <p className={`text-2xl font-bold tabular ${tone}`}>{n}</p>
              <p className="text-sm text-text-2">{t(`integration.review.count.${k}`)}</p>
            </div>
          ))}
        </div>
        {run.data.duplicateOf && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-text">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('integration.review.duplicate')}
          </p>
        )}
      </Card>

      {groups.unmatched.length > 0 && <EmployeeMapper run={run.data} refs={groups.unmatched} />}
      {groups.codes.length > 0 && <CodeMapper run={run.data} codes={groups.codes} />}

      {(groups.otherErrors.length > 0 || groups.noId.length > 0) && (
        <Card>
          <CardHeader
            title={t('integration.review.otherErrors', { count: new Set([...groups.otherErrors, ...groups.noId].map((r) => r.id)).size })}
            subtitle={t('integration.review.otherErrorsHint')}
            icon={<CircleAlert className="size-5 text-danger" />}
          />
          <RowList rows={[...new Map([...groups.noId, ...groups.otherErrors].map((r) => [r.id, r])).values()]} tone="danger" />
        </Card>
      )}

      {groups.warnings.length > 0 && (
        <Card>
          <CardHeader title={t('integration.review.warnings', { count: groups.warnings.length })} icon={<AlertTriangle className="size-5 text-warning" />} />
          <RowList rows={groups.warnings} tone="warning" />
        </Card>
      )}

      {groups.ignored.length > 0 && (
        <section>
          <SectionTitle>{t('integration.review.ignored', { count: groups.ignored.length })}</SectionTitle>
          <Card>
            <RowList rows={groups.ignored} tone="neutral" />
          </Card>
        </section>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onReupload}>
            {t('integration.otherFile')}
          </Button>
          <Button
            variant="ghost"
            icon={<RefreshCcw className="size-4" />}
            onClick={async () => {
              await integrationRepository.revalidate(runId)
              void refresh(runId)
            }}
          >
            {t('integration.review.recheck')}
          </Button>
        </div>
        <Button icon={<ArrowRight className="size-[18px]" />} disabled={errors > 0} onClick={onNext}>
          {errors > 0 ? t('integration.review.fixFirst', { count: errors }) : t('integration.review.toPreview')}
        </Button>
      </div>
    </div>
  )
}
