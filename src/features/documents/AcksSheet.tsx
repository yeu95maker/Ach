import { BellRing, CheckCircle2, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey, toAppError } from '@/core/errors'
import type { SharedDocument } from '@/domain/documents'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Sheet, SkeletonCard, useToast } from '@/ui'
import { useDocumentAcks, useDocumentMutations } from './useDocuments'

export function AcksSheet({ doc, onClose }: { doc: SharedDocument | null; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const acks = useDocumentAcks(doc?.id ?? null)
  const { remind } = useDocumentMutations()
  const missing = (acks.data ?? []).filter((a) => !a.acknowledgedAt).length

  return (
    <Sheet
      open={!!doc}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('documents.acksTitle')}
      description={doc ? `${doc.title} · v${doc.version}` : ''}
      footer={
        missing > 0 && doc ? (
          <Button
            fullWidth
            variant="secondary"
            icon={<BellRing className="size-4" />}
            loading={remind.isPending}
            onClick={() =>
              void remind.mutateAsync(doc.id).then(
                (n) => toast.show({ tone: 'success', title: t('documents.reminded', { count: n }) }),
                (e: unknown) =>
                  toast.show({
                    tone: 'error',
                    title: t('errors.title'),
                    description: toAppError(e).kind === 'rate_limited' ? t('documents.remindedRecently') : t(errorMessageKey(e)),
                  }),
              )
            }
          >
            {t('documents.remind', { count: missing })}
          </Button>
        ) : undefined
      }
    >
      {acks.isLoading && <SkeletonCard lines={4} />}
      {acks.error && <QueryError error={acks.error} onRetry={() => void acks.refetch()} />}
      <ul className="divide-y divide-border/70">
        {(acks.data ?? []).map((a) => (
          <li key={a.employeeId} className="flex items-center gap-3 py-3">
            {a.acknowledgedAt ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <Circle className="size-5 shrink-0 text-text-3" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{`${a.firstName} ${a.lastName}`}</span>
              <span className="block truncate text-sm text-text-3">{a.jobTitle}</span>
            </span>
            <span className="shrink-0 text-sm text-text-3">{a.acknowledgedAt ? fmt.relative(a.acknowledgedAt) : t('documents.notYet')}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
