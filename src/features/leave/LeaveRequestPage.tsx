import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarRange } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toAppError } from '@/core/errors'
import { requestsRepository } from '@/data/requestsRepository'
import { addDaysISO, countWorkdays, daysBetweenInclusive, isoDateInTimeZone } from '@/domain/dates'
import type { LeaveType } from '@/domain/types'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Button, Card, Field, Input, PageHeader, Textarea, cn, useToast } from '@/ui'

const TYPES: LeaveType[] = ['vacation', 'overtime_compensation', 'training', 'special', 'unpaid']

export function LeaveRequestPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)

  const [leaveType, setLeaveType] = useState<LeaveType>('vacation')
  const [startDate, setStartDate] = useState(addDaysISO(today, 14))
  const [endDate, setEndDate] = useState(addDaysISO(today, 18))
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const valid = startDate >= today && endDate >= startDate

  const submit = useMutation({
    mutationFn: () =>
      requestsRepository.createLeaveRequest({ employeeId: employment.employeeId, leaveType, startDate, endDate, comment: comment.trim() || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myLeave(employment.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
      toast.show({ tone: 'success', title: t('leave.submittedToast'), description: t('leave.submittedHint') })
      navigate('/requests', { replace: true })
    },
    onError: (e) => setError(toAppError(e).kind === 'conflict' ? t('leave.overlap') : t(`errors.${toAppError(e).kind}`)),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!valid) return setError(t('leave.invalidRange'))
    submit.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t('requests.title')}
      </Link>
      <PageHeader title={t('leave.newTitle')} subtitle={t('leave.newSubtitle')} />

      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-text-2">{t('leave.type')}</legend>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={leaveType === type}
                  onClick={() => setLeaveType(type)}
                  className={cn(
                    'h-11 rounded-full px-4 text-[15px] font-medium transition-colors duration-150',
                    leaveType === type ? 'bg-accent text-white shadow-sm' : 'bg-surface-2 text-text-2 hover:text-text',
                  )}
                >
                  {t(`leaveType.${type}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.from')} htmlFor="start">
              <Input
                id="start"
                type="date"
                min={today}
                value={startDate}
                required
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (e.target.value > endDate) setEndDate(e.target.value)
                }}
              />
            </Field>
            <Field label={t('common.to')} htmlFor="end">
              <Input id="end" type="date" min={startDate} value={endDate} required onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          {valid && (
            <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent-text">
              <CalendarRange className="size-5 shrink-0" aria-hidden />
              <p className="text-[15px] font-medium">
                {fmt.dateRange(startDate, endDate)} · {t('leave.workdays', { count: countWorkdays(startDate, endDate) })} ·{' '}
                {t('leave.calendarDays', { count: daysBetweenInclusive(startDate, endDate) })}
              </p>
            </div>
          )}

          <Field label={t('common.comment')} htmlFor="comment" optional optionalLabel={t('common.optional')}>
            <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder={t('leave.commentPlaceholder')} />
          </Field>

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
        </Card>

        <Button type="submit" size="lg" fullWidth loading={submit.isPending} disabled={!valid}>
          {t('leave.submit')}
        </Button>
      </form>
    </div>
  )
}
