import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { DOCUMENT_MIME_TYPES, fileError } from '@/domain/documents'
import { toISODate } from '@/domain/dates'
import { Button, Field, Input, Sheet, Textarea, useToast } from '@/ui'
import { useTrainingMutations } from './useTrainings'

export interface ReportTarget {
  requirementId: string
  title: string
  /** set when a lead records it for someone else */
  employeeId?: string
  employeeName?: string
}

export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={target?.employeeName ? t('trainings.recordFor', { name: target.employeeName }) : t('trainings.reportTitle')}
      description={target?.title}
    >
      {/* mounted per opening → fresh form state */}
      {target && <ReportForm target={target} onDone={onClose} />}
    </Sheet>
  )
}

function ReportForm({ target, onDone }: { target: ReportTarget; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { report } = useTrainingMutations()
  const today = toISODate(new Date())
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const problem = file ? fileError(file) : null
  const valid = !!date && date <= today && !problem

  const submit = () => {
    if (!valid) return
    void report
      .mutateAsync({ requirementId: target.requirementId, title: target.title, completedOn: date, note: note.trim() || null, file, employeeId: target.employeeId })
      .then(
        () => {
          toast.show({ tone: 'success', title: t('trainings.reported'), description: target.employeeId ? undefined : t('trainings.reportedHint') })
          onDone()
        },
        (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
      )
  }

  return (
    <div className="space-y-4">
      <Field label={t('trainings.date')} htmlFor="training-date">
        <Input id="training-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {!target.employeeId && (
        <Field
          label={t('trainings.certificate')}
          htmlFor="training-file"
          optional
          optionalLabel={t('common.optional')}
          hint={t('trainings.certificateHint')}
          error={problem ? t(`documents.fileError.${problem}`) : undefined}
        >
          <input
            id="training-file"
            type="file"
            accept={DOCUMENT_MIME_TYPES.join(',')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-4 file:py-2.5 file:font-semibold file:text-primary-text"
          />
        </Field>
      )}
      <Field label={t('trainings.note')} htmlFor="training-note" optional optionalLabel={t('common.optional')}>
        <Textarea id="training-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button fullWidth disabled={!valid} loading={report.isPending} onClick={submit} icon={<CheckCircle2 className="size-4" />}>
        {t('trainings.save')}
      </Button>
    </div>
  )
}
