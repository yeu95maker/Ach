import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { integrationRepository, type ImportRun } from '@/data/integrationRepository'
import { detectLayout, suggestMapping, toStagingRows } from '@/domain/integration/normalize'
import type { ColumnMapping, ColumnRole, DateFormat, ImportLayout } from '@/domain/integration/types'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, Field, SegmentedControl, Select, useToast } from '@/ui'
import type { UploadResult } from './UploadStep'

const LIST_ROLES: ColumnRole[] = ['employeeId', 'employeeName', 'lastName', 'firstName', 'date', 'code', 'start', 'end', 'break', 'externalShiftId']
const GRID_ROLES: ColumnRole[] = ['employeeId', 'employeeName', 'lastName', 'firstName']

export function ColumnsStep({
  upload,
  saved,
  onStaged,
  onBack,
}: {
  upload: UploadResult
  saved: ImportRun['columnMapping'] | null
  onStaged: (run: ImportRun) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const [tableIndex, setTableIndex] = useState(0)
  const table = upload.tables[tableIndex]!
  const sameHeaders = !!saved?.headers && saved.headers.join('|') === table.headers.join('|')
  const [layout, setLayout] = useState<ImportLayout>(sameHeaders && saved?.layout ? saved.layout : detectLayout(table, upload.periodStart))
  const [dateFormat, setDateFormat] = useState<DateFormat>(saved?.dateFormat ?? 'dmy')
  const [mapping, setMapping] = useState<ColumnMapping>(
    sameHeaders && saved?.mapping && saved.layout === layout ? saved.mapping : suggestMapping(table, layout, upload.periodStart, dateFormat),
  )

  const reset = (next: { layout?: ImportLayout; dateFormat?: DateFormat; tableIndex?: number }) => {
    const tbl = upload.tables[next.tableIndex ?? tableIndex]!
    const l = next.layout ?? layout
    if (next.layout) setLayout(next.layout)
    if (next.dateFormat) setDateFormat(next.dateFormat)
    if (next.tableIndex !== undefined) setTableIndex(next.tableIndex)
    setMapping(suggestMapping(tbl, l, upload.periodStart, next.dateFormat ?? dateFormat))
  }

  const result = useMemo(() => toStagingRows(table, layout, mapping, { dateFormat }), [table, layout, mapping, dateFormat])
  const hasPerson = mapping.roles.employeeId !== undefined || mapping.roles.employeeName !== undefined || mapping.roles.lastName !== undefined
  const ready =
    hasPerson &&
    (layout === 'grid' ? Object.keys(mapping.dayColumns ?? {}).length > 0 : mapping.roles.date !== undefined && mapping.roles.code !== undefined) &&
    result.rows.length > 0
  const sample = (col: number) =>
    table.rows
      .map((r) => r[col])
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ')

  const stage = useMutation({
    mutationFn: () =>
      integrationRepository.stage({
        sourceId: upload.sourceId,
        unitId: upload.unitId,
        periodStart: upload.periodStart,
        periodEnd: upload.periodEnd,
        fileName: upload.fileName,
        fileSha256: upload.fileSha256,
        layout,
        mapping: { layout, mapping, dateFormat, headers: table.headers },
        rows: result.rows,
      }),
    onSuccess: onStaged,
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const roles = layout === 'grid' ? GRID_ROLES : LIST_ROLES
  const dayCount = Object.keys(mapping.dayColumns ?? {}).length

  return (
    <Card padding="lg" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {upload.tables.length > 1 && (
          <Field label={t('integration.sheet')} htmlFor="imp-sheet">
            <Select id="imp-sheet" value={tableIndex} onChange={(e) => reset({ tableIndex: Number(e.target.value) })}>
              {upload.tables.map((x, i) => (
                <option key={x.name + i} value={i}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold">{t('integration.layout')}</p>
          <SegmentedControl
            label={t('integration.layout')}
            value={layout}
            onChange={(l) => reset({ layout: l })}
            options={[
              { value: 'list', label: t('integration.layoutList') },
              { value: 'grid', label: t('integration.layoutGrid') },
            ]}
          />
        </div>
        <Field label={t('integration.dateFormat')} htmlFor="imp-df">
          <Select id="imp-df" value={dateFormat} onChange={(e) => reset({ dateFormat: e.target.value as DateFormat })}>
            <option value="dmy">TT.MM.JJJJ</option>
            <option value="ymd">JJJJ-MM-TT</option>
            <option value="mdy">MM/TT/JJJJ</option>
          </Select>
        </Field>
      </div>

      <p className="text-sm text-text-2">{t(layout === 'grid' ? 'integration.layoutGridHint' : 'integration.layoutListHint')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((role) => (
          <Field key={role} label={t(`integration.role.${role}`)} htmlFor={`col-${role}`} hint={mapping.roles[role] !== undefined ? sample(mapping.roles[role]!) : undefined}>
            <Select
              id={`col-${role}`}
              value={mapping.roles[role] ?? ''}
              onChange={(e) =>
                setMapping((m) => ({ ...m, roles: { ...m.roles, [role]: e.target.value === '' ? undefined : Number(e.target.value) } }))
              }
            >
              <option value="">{t('integration.notInFile')}</option>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || t('integration.column', { n: i + 1 })}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>

      {layout === 'grid' && (
        <p className="rounded-2xl bg-surface-2/70 px-4 py-3 text-sm text-text-2">
          {dayCount > 0
            ? t('integration.dayColumns', {
                count: dayCount,
                from: fmt.dateShort(Object.values(mapping.dayColumns!).sort()[0]!),
                to: fmt.dateShort(Object.values(mapping.dayColumns!).sort().at(-1)!),
              })
            : t('integration.noDayColumns')}
        </p>
      )}

      <div className="rounded-2xl border border-border/70 p-4">
        <p className="text-sm font-semibold">{t('integration.readRows', { count: result.rows.length })}</p>
        {result.problems.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.problems.slice(0, 8).map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-warning-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('integration.line', { line: p.line })}: {t(`integration.parse.${p.code}`, { value: p.value ?? '' })}
              </li>
            ))}
            {result.problems.length > 8 && <li className="text-sm text-text-3">{t('integration.moreProblems', { count: result.problems.length - 8 })}</li>}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          {t('integration.otherFile')}
        </Button>
        <Button icon={<ArrowRight className="size-[18px]" />} disabled={!ready} loading={stage.isPending} onClick={() => stage.mutate()}>
          {t('integration.check')}
        </Button>
      </div>
    </Card>
  )
}
