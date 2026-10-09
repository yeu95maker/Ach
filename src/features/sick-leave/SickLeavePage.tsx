import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toAppError } from '@/core/errors'
import { requestsRepository } from '@/data/requestsRepository'
import { addDaysISO, daysBetweenInclusive, isoDateInTimeZone } from '@/domain/dates'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { ButtonLink, Button, Card, Field, Input, PageHeader, Textarea, cn } from '@/ui'

type Preset = 'today' | 'two' | 'three' | 'custom'

/** Deliberately minimal: choose period → optional comment → send. */
export function SickLeavePage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const queryClient = useQueryClient()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)

  const [preset, setPreset] = useState<Preset>('today')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'custom') return
    setStartDate(today)
    setEndDate(addDaysISO(today, p === 'today' ? 0 : p === 'two' ? 1 : 2))
  }

  const submit = useMutation({
    mutationFn: () => requestsRepository.reportSickLeave({ employeeId: employment.employeeId, startDate, endDate, comment: comment.trim() || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mySick(employment.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.absencesAll(employment.employeeId) })
    },
    onError: (e) => setError(toAppError(e).kind === 'conflict' ? t('sick.overlap') : t(`errors.${toAppError(e).kind}`)),
  })

  const valid = endDate >= startDate

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!valid) return setError(t('leave.invalidRange'))
    submit.mutate()
  }

  if (submit.isSuccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
        <span className="mb-6 flex size-20 animate-scale-in items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-10" />
        </span>
        <h1 className="text-[28px] font-bold tracking-tight">{t('sick.successTitle')}</h1>
        <p className="mt-2 text-[15px] text-text-2">{t('sick.successText', { range: fmt.dateRange(startDate, endDate) })}</p>
        <div className="mt-8 grid w-full gap-3">
          <ButtonLink to="/" size="lg" fullWidth>
            {t('common.backToHome')}
          </ButtonLink>
          <ButtonLink to="/requests" variant="ghost" size="lg" fullWidth>
            {t('requests.title')}
          </ButtonLink>
        </div>
      </div>
    )
  }

  const presets: { id: Preset; label: string }[] = [
    { id: 'today', label: t('sick.presetToday') },
    { id: 'two', label: t('sick.presetTwo') },
    { id: 'three', label: t('sick.presetThree') },
    { id: 'custom', label: t('sick.presetCustom') },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t('nav.home')}
      </Link>
      <PageHeader title={t('sick.title')} subtitle={t('sick.subtitle')} />

      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-text-2">{t('sick.period')}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset === p.id}
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    'h-14 rounded-2xl px-3 text-[15px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
                    preset === p.id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-2 text-text-2 hover:text-text',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          {preset === 'custom' && (
            <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
              <Field label={t('common.from')} htmlFor="sick-start">
                <Input
                  id="sick-start"
                  type="date"
                  min={addDaysISO(today, -30)}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    if (e.target.value > endDate) setEndDate(e.target.value)
                  }}
                />
              </Field>
              <Field label={t('common.to')} htmlFor="sick-end">
                <Input id="sick-end" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
          )}

          <p className="rounded-2xl bg-surface-2/70 px-4 py-3 text-[15px] font-medium">
            {fmt.dateRange(startDate, endDate)} · {t('sick.days', { count: valid ? daysBetweenInclusive(startDate, endDate) : 0 })}
          </p>

          <Field
            label={t('common.comment')}
            htmlFor="sick-comment"
            optional
            optionalLabel={t('common.optional')}
            hint={
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden />
                {t('sick.commentPrivacy')}
              </span>
            }
          >
            <Textarea id="sick-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder={t('sick.commentPlaceholder')} />
          </Field>

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
        </Card>

        <Button type="submit" variant="danger" size="lg" fullWidth loading={submit.isPending} disabled={!valid}>
          {t('sick.submit')}
        </Button>
        <p className="text-center text-sm text-text-3">{t('sick.notifyHint')}</p>
      </form>
    </div>
  )
}
