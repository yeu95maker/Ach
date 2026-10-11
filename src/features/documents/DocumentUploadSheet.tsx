import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { DOCUMENT_CATEGORIES, DOCUMENT_MIME_TYPES, fileError, type SharedDocument } from '@/domain/documents'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@/ui'
import { useDocumentMutations, useDocumentScope } from './useDocuments'

/** New document, or – with `previous` – a new version of it. */
export function DocumentUploadSheet({ open, previous, onClose }: { open: boolean; previous: SharedDocument | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={previous ? t('documents.newVersionTitle', { version: previous.version + 1 }) : t('documents.newTitle')}
      description={previous ? t('documents.newVersionHint') : t('documents.newHint')}
    >
      {open && <UploadForm previous={previous} onDone={onClose} />}
    </Sheet>
  )
}

function UploadForm({ previous, onDone }: { previous: SharedDocument | null; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const employment = useEmployment()
  const scope = useDocumentScope()
  const { publish } = useDocumentMutations()
  const [title, setTitle] = useState(previous?.title ?? '')
  const [category, setCategory] = useState<string>(previous?.category ?? 'sop')
  const [picked, setUnit] = useState<string>(previous ? (previous.unitId ?? 'hospital') : '')
  const [description, setDescription] = useState(previous?.description ?? '')
  const [requiresAck, setRequiresAck] = useState(previous?.requiresAck ?? true)
  const [file, setFile] = useState<File | null>(null)

  const units = scope.data?.documentUnits ?? []
  // until the user picks: the first ward allowed (scope may arrive later)
  const unit = picked || units[0]?.id || (scope.data?.documentHospital ? 'hospital' : '')

  const problem = file ? fileError(file) : null
  const valid = title.trim().length > 0 && !!unit && !!file && !problem

  const submit = () => {
    if (!valid) return
    void publish
      .mutateAsync({
        hospitalId: employment.hospital.id,
        unitId: unit === 'hospital' ? null : unit,
        title: title.trim(),
        category,
        description: description.trim() || null,
        requiresAck,
        file,
        supersedesId: previous?.id ?? null,
      })
      .then(
        () => {
          toast.show({ tone: 'success', title: t('documents.published'), description: t('documents.publishedHint') })
          onDone()
        },
        (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
      )
  }

  return (
    <div className="space-y-4">
      <Field label={t('documents.file')} htmlFor="doc-file" error={problem ? t(`documents.fileError.${problem}`) : undefined} hint={t('documents.fileHint')}>
        <input
          id="doc-file"
          data-testid="doc-file"
          type="file"
          accept={DOCUMENT_MIME_TYPES.join(',')}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-4 file:py-2.5 file:font-semibold file:text-primary-text"
        />
      </Field>
      <Field label={t('documents.titleLabel')} htmlFor="doc-title">
        <Input id="doc-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('documents.titlePlaceholder')} />
      </Field>
      {!previous && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('documents.categoryLabel')} htmlFor="doc-category">
            <Select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`documents.category.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('documents.audience')} htmlFor="doc-unit">
            <Select id="doc-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {scope.data?.documentHospital && <option value="hospital">{t('documents.wholeHospital')}</option>}
            </Select>
          </Field>
        </div>
      )}
      <Field label={t('documents.description')} htmlFor="doc-description" optional optionalLabel={t('common.optional')}>
        <Textarea id="doc-description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="flex items-start gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
        <span>
          <span className="block text-[15px] font-medium">{t('documents.requiresAck')}</span>
          <span className="block text-sm text-text-3">{t('documents.requiresAckHint')}</span>
        </span>
      </label>
      <Button fullWidth disabled={!valid} loading={publish.isPending} onClick={submit} icon={<FileUp className="size-4" />}>
        {t('documents.publish')}
      </Button>
    </div>
  )
}
