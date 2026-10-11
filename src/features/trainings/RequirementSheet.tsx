import { GraduationCap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { useDocumentScope } from '@/features/documents/useDocuments'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@/ui'
import { useTrainingMutations } from './useTrainings'

const INTERVALS = [0, 12, 24, 36] as const

export function RequirementSheet({ open, onClose, defaultUnitId }: { open: boolean; onClose: () => void; defaultUnitId: string | null }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('common.close')} title={t('trainings.newTitle')} description={t('trainings.newHint')}>
      {open && <RequirementForm defaultUnitId={defaultUnitId} onDone={onClose} />}
    </Sheet>
  )
}

function RequirementForm({ defaultUnitId, onDone }: { defaultUnitId: string | null; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const employment = useEmployment()
  const scope = useDocumentScope()
  const { save } = useTrainingMutations()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [interval, setIntervalMonths] = useState<number>(12)
  const [picked, setUnit] = useState('')
  // until the user picks: the ward shown in the overview, else the first allowed choice
  const unit = picked || defaultUnitId || scope.data?.trainingUnits[0]?.id || (scope.data?.trainingHospital ? 'hospital' : '')

  const valid = title.trim().length > 0 && !!unit
  const submit = () => {
    if (!valid) return
    void save
      .mutateAsync({
        id: null,
        hospitalId: employment.hospital.id,
        unitId: unit === 'hospital' ? null : unit,
        title: title.trim(),
        description: description.trim() || null,
        intervalMonths: interval || null,
      })
      .then(
        () => {
          toast.show({ tone: 'success', title: t('trainings.created'), description: t('trainings.createdHint') })
          onDone()
        },
        (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
      )
  }

  return (
    <div className="space-y-4">
      <Field label={t('trainings.titleLabel')} htmlFor="req-title">
        <Input id="req-title" value={title} maxLength={200} placeholder={t('trainings.titlePlaceholder')} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('trainings.interval')} htmlFor="req-interval">
          <Select id="req-interval" value={interval} onChange={(e) => setIntervalMonths(Number(e.target.value))}>
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m ? t('trainings.every', { count: m / 12 }) : t('trainings.once')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('trainings.appliesTo')} htmlFor="req-unit">
          <Select id="req-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {(scope.data?.trainingUnits ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            {scope.data?.trainingHospital && <option value="hospital">{t('documents.wholeHospital')}</option>}
          </Select>
        </Field>
      </div>
      <Field label={t('documents.description')} htmlFor="req-description" optional optionalLabel={t('common.optional')}>
        <Textarea id="req-description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Button fullWidth disabled={!valid} loading={save.isPending} onClick={submit} icon={<GraduationCap className="size-4" />}>
        {t('trainings.create')}
      </Button>
    </div>
  )
}
