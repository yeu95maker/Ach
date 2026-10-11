import { FileClock, FileSpreadsheet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { QueryError } from '@/components/QueryState'
import type { ImportRunStatus } from '@/data/integrationRepository'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Card, EmptyState, SkeletonCard, type Tone } from '@/ui'
import { useImportHistory } from './useImport'

export const RUN_TONE: Record<ImportRunStatus, Tone> = {
  staged: 'accent',
  applied: 'warning',
  published: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  superseded: 'neutral',
}

/** Import history: status, time, ward, responsible person and a readable summary. */
export function ImportHistory() {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const history = useImportHistory()

  if (history.isLoading) return <SkeletonCard lines={4} />
  if (history.error) return <QueryError error={history.error} onRetry={() => void history.refetch()} />
  if (!history.data?.length)
    return (
      <Card>
        <EmptyState icon={<FileClock />} title={t('integration.history.empty')} />
      </Card>
    )

  return (
    <Card padding="none">
      <ul className="divide-y divide-border/70">
        {history.data.map((h) => {
          const d = h.summary.diff
          const body = (
            <div className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-2">
                <FileSpreadsheet className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{h.fileName ?? h.sourceName}</span>
                  <Badge tone={RUN_TONE[h.status]}>{t(`integration.status.${h.status}`)}</Badge>
                  {h.duplicateOf && <Badge>{t('integration.history.duplicate')}</Badge>}
                </div>
                <p className="text-sm text-text-2">
                  {h.unitName} · {fmt.monthYear(h.periodStart)}
                </p>
                <p className="text-sm text-text-3">
                  {t('integration.history.by', { name: h.createdByName || t('integration.history.viaApi'), when: fmt.relative(h.createdAt) })}
                  {h.publishedAt && ` · ${t('integration.history.publishedAt', { when: fmt.relative(h.publishedAt) })}`}
                </p>
                <p className="mt-1 text-sm text-text-2">
                  {d
                    ? t('integration.preview.diffLine', d)
                    : t('integration.history.rows', { ok: (h.summary.ok ?? 0) + (h.summary.warnings ?? 0), errors: h.summary.errors ?? 0 })}
                </p>
                {h.errorMessage && <p className="mt-1 text-sm text-danger-text">{t('integration.history.failed', { message: h.errorMessage })}</p>}
              </div>
            </div>
          )
          return (
            <li key={h.id}>
              {h.status === 'staged' ? (
                <Link to={`/schedule/import?run=${h.id}`} className="block transition-colors hover:bg-surface-2/60">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
