import { Archive, CheckCircle2, ExternalLink, FilePlus2, FileText, History, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError, Stagger } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { openAcks, type SharedDocument } from '@/domain/documents'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, SkeletonCard, useToast } from '@/ui'
import { AcksSheet } from './AcksSheet'
import { DocumentUploadSheet } from './DocumentUploadSheet'
import { openDocumentFile, useDocumentMutations, useDocumentScope, useDocuments } from './useDocuments'

function DocumentCard({ doc, onAcks, onNewVersion }: { doc: SharedDocument; onAcks: () => void; onNewVersion: () => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const m = useDocumentMutations()
  const fail = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })
  const open = () => void openDocumentFile(doc.storagePath).catch(fail)

  return (
    <Card padding="sm" className="sm:p-5" data-testid="document-card">
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] leading-snug font-semibold">{doc.title}</p>
          <p className="text-sm text-text-3">
            {t(`documents.category.${doc.category}`, { defaultValue: doc.category })} · {doc.unitName ?? t('documents.wholeHospital')} · v{doc.version}
            {doc.publishedAt && ` · ${fmt.relative(doc.publishedAt)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!doc.publishedAt && <Badge tone="warning">{t('documents.draft')}</Badge>}
            {doc.requiresAck && !doc.canManage &&
              (doc.acknowledgedAt ? (
                <Badge tone="success">{t('documents.confirmedOn', { when: fmt.relative(doc.acknowledgedAt) })}</Badge>
              ) : (
                <Badge tone="danger">{t('documents.pleaseConfirm')}</Badge>
              ))}
            {doc.canManage && doc.requiresAck && doc.audience != null && (
              <Badge tone={doc.acked === doc.audience ? 'success' : 'neutral'}>
                <Users className="mr-1 size-3.5" aria-hidden />
                {t('documents.ackProgress', { acked: doc.acked ?? 0, audience: doc.audience })}
              </Badge>
            )}
          </div>
          {doc.description && <p className="mt-2 text-sm text-text-2">{doc.description}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" icon={<ExternalLink className="size-4" />} onClick={open}>
          {t('documents.open')}
        </Button>
        {doc.requiresAck && !doc.canManage && !doc.acknowledgedAt && doc.publishedAt && (
          <Button
            size="sm"
            icon={<CheckCircle2 className="size-4" />}
            loading={m.acknowledge.isPending && m.acknowledge.variables === doc.id}
            onClick={() => void m.acknowledge.mutateAsync(doc.id).then(() => toast.show({ tone: 'success', title: t('documents.confirmedToast') }), fail)}
          >
            {t('documents.confirm')}
          </Button>
        )}
        {doc.canManage && doc.requiresAck && doc.publishedAt && (
          <Button size="sm" variant="ghost" icon={<Users className="size-4" />} onClick={onAcks}>
            {t('documents.whoConfirmed')}
          </Button>
        )}
        {doc.canManage && doc.publishedAt && (
          <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={onNewVersion}>
            {t('documents.newVersion')}
          </Button>
        )}
        {doc.canManage && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Archive className="size-4" />}
            loading={m.archive.isPending && m.archive.variables === doc.id}
            onClick={() => {
              if (window.confirm(t('documents.archiveConfirm', { title: doc.title })))
                void m.archive.mutateAsync(doc.id).then(() => toast.show({ tone: 'info', title: t('documents.archived') }), fail)
            }}
          >
            {t('documents.archive')}
          </Button>
        )}
      </div>
    </Card>
  )
}

export function DocumentsPage() {
  const { t } = useTranslation()
  const docs = useDocuments()
  const scope = useDocumentScope()
  const [uploading, setUploading] = useState(false)
  const [previous, setPrevious] = useState<SharedDocument | null>(null)
  const [acksFor, setAcksFor] = useState<SharedDocument | null>(null)
  const canPublish = !!scope.data && (scope.data.documentUnits.length > 0 || scope.data.documentHospital)

  const { todo, rest } = useMemo(() => {
    const all = docs.data ?? []
    const open = new Set(openAcks(all).map((d) => d.id))
    return { todo: all.filter((d) => open.has(d.id)), rest: all.filter((d) => !open.has(d.id)) }
  }, [docs.data])

  const list = (items: SharedDocument[], offset = 0) => (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((d, i) => (
        <Stagger key={d.id} index={offset + i}>
          <DocumentCard doc={d} onAcks={() => setAcksFor(d)} onNewVersion={() => { setPrevious(d); setUploading(true) }} />
        </Stagger>
      ))}
    </div>
  )

  return (
    <>
      <PageHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        actions={
          canPublish ? (
            <Button icon={<FilePlus2 className="size-4" />} onClick={() => { setPrevious(null); setUploading(true) }}>
              {t('documents.new')}
            </Button>
          ) : undefined
        }
      />

      {docs.isLoading && <SkeletonCard lines={3} />}
      {docs.error && <QueryError error={docs.error} onRetry={() => void docs.refetch()} />}
      {docs.data && docs.data.length === 0 && (
        <Card>
          <EmptyState icon={<FileText />} title={t('documents.empty')} description={canPublish ? t('documents.emptyHintLead') : t('documents.emptyHint')} />
        </Card>
      )}

      {todo.length > 0 && (
        <section className="mb-8">
          <SectionTitle>{t('documents.toConfirm', { count: todo.length })}</SectionTitle>
          {list(todo)}
        </section>
      )}
      {rest.length > 0 && (
        <section>
          {todo.length > 0 && <SectionTitle>{t('documents.all')}</SectionTitle>}
          {list(rest, todo.length)}
        </section>
      )}

      <DocumentUploadSheet open={uploading} previous={previous} onClose={() => setUploading(false)} />
      <AcksSheet doc={acksFor} onClose={() => setAcksFor(null)} />
    </>
  )
}
