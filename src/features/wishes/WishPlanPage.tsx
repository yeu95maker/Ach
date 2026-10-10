import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarHeart, CheckCircle2, ClipboardList, Hourglass, Info, Lock, StickyNote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { QueryError } from '@/components/QueryState'
import { toAppError } from '@/core/errors'
import { wishRepository, type ShiftTypeOption } from '@/data/wishRepository'
import { isoDateInTimeZone } from '@/domain/dates'
import { can } from '@/domain/permissions'
import type { ISODate } from '@/domain/types'
import {
  applyWish,
  countByType,
  daysUntil,
  WISH_TYPES,
  wishesEqual,
  wishPlanEditability,
  type Wish,
  type WishPeriod,
  type WishSubmission,
} from '@/domain/wishes'
import { queryKeys } from '@/features/queryKeys'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, SectionTitle, Sheet, SkeletonCard, Textarea, cn } from '@/ui'
import { useMySubmission, useShiftTypes, useWishPeriods } from './useWishes'
import { WishCalendar } from './WishCalendar'
import { WishPalette, type Brush } from './WishPalette'
import { WishPill, WishStatusBadge, wishStyles } from './wishStyles'

/** Pick the most relevant period: open with nearest deadline, else the newest. */
function defaultPeriod(periods: WishPeriod[]): WishPeriod | undefined {
  const open = periods.filter((p) => p.status === 'open').sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime())
  return open[0] ?? periods[0]
}

export function WishPlanPage() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const [params, setParams] = useSearchParams()
  const periods = useWishPeriods()
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null)

  const myUnitIds = useMemo(() => new Set(employment.units.map((u) => u.id)), [employment.units])
  const mine = useMemo(
    () => (periods.data ?? []).filter((p) => myUnitIds.has(p.unitId) && p.status !== 'draft').sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
    [periods.data, myUnitIds],
  )
  const period = mine.find((p) => p.id === params.get('period')) ?? defaultPeriod([...mine].reverse())
  const submission = useMySubmission(period?.id ?? null)
  const shiftTypes = useShiftTypes()
  const canManage = can(employment, 'wishes.view') || can(employment, 'wishes.manage')

  return (
    <>
      <Link to="/schedule" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden />
        {t('schedule.title')}
      </Link>
      <PageHeader
        title={t('wishes.title')}
        subtitle={t('wishes.subtitle')}
        actions={
          canManage && (
            <ButtonLink to="/schedule/wishes/manage" variant="secondary" icon={<ClipboardList className="size-[18px]" />}>
              {t('wishes.manageLink')}
            </ButtonLink>
          )
        }
      />

      {periods.isLoading && <SkeletonCard lines={5} />}
      {periods.error && <QueryError error={periods.error} onRetry={() => void periods.refetch()} />}
      {periods.data && !period && (
        <Card>
          <EmptyState icon={<CalendarHeart />} title={t('wishes.noPeriodTitle')} description={t('wishes.noPeriodText')} />
        </Card>
      )}

      {period && (
        <div className="mx-auto max-w-3xl space-y-5">
          {mine.length > 1 && (
            <div role="tablist" aria-label={t('wishes.period')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {mine.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  type="button"
                  aria-selected={p.id === period.id}
                  onClick={() => {
                    setJustSubmitted(null)
                    setParams({ period: p.id }, { replace: true })
                  }}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold capitalize transition-colors',
                    p.id === period.id ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-text-2 shadow-sm ring-1 ring-border/70',
                  )}
                >
                  {fmt.monthYear(p.periodStart)}
                  {p.status === 'open' ? (
                    <span className="size-2 rounded-full bg-success" aria-label={t('wishPeriodStatus.open')} />
                  ) : (
                    <Lock className="size-3.5 opacity-70" aria-label={t(`wishPeriodStatus.${p.status}`)} />
                  )}
                </button>
              ))}
            </div>
          )}

          {submission.isLoading || shiftTypes.isLoading ? (
            <SkeletonCard lines={6} />
          ) : justSubmitted === period.id ? (
            <SubmittedView onShow={() => setJustSubmitted(null)} />
          ) : (
            <WishEditor
              key={`${period.id}-${submission.data?.submittedAt.getTime() ?? 'new'}`}
              period={period}
              submission={submission.data ?? null}
              shiftTypes={shiftTypes.data ?? []}
              onSubmitted={() => setJustSubmitted(period.id)}
            />
          )}
        </div>
      )}
    </>
  )
}

function SubmittedView({ onShow }: { onShow: () => void }) {
  const { t } = useTranslation()
  return (
    <Card padding="lg" className="flex flex-col items-center text-center">
      <span className="mb-5 flex size-20 animate-scale-in items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-10" />
      </span>
      <h2 className="text-2xl font-bold tracking-tight">{t('wishes.successTitle')}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-text-2">{t('wishes.successText')}</p>
      <div className="mt-7 grid w-full max-w-sm gap-3">
        <Button size="lg" onClick={onShow}>
          {t('wishes.showWishes')}
        </Button>
        <ButtonLink to="/" variant="ghost" size="lg">
          {t('common.backToHome')}
        </ButtonLink>
      </div>
    </Card>
  )
}

function DeadlineBanner({ period, submission, editable }: { period: WishPeriod; submission: WishSubmission | null; editable: boolean }) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const month = fmt.monthYear(period.periodStart)
  const deadline = fmt.date(isoDateInTimeZone(period.deadlineAt, employment.hospital.timezone))

  if (editable) {
    const days = daysUntil(period.deadlineAt)
    return (
      <div className={cn('flex items-start gap-3 rounded-2xl px-4 py-3.5', days <= 3 ? 'bg-warning-soft text-warning-text' : 'bg-accent-soft text-accent-text')}>
        <Hourglass className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="text-[15px]">
          <p className="font-semibold">{t('wishes.deadlineText', { month, date: `${deadline}, ${fmt.time(period.deadlineAt)}` })}</p>
          <p className="opacity-90">
            {days === 0 ? t('wishes.deadlineToday') : t('wishes.daysLeft', { count: days })}
            {submission && ` · ${t('wishes.submittedAt', { when: fmt.relative(submission.submittedAt) })}`}
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-text-2">
      <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="text-[15px]">
        {period.status === 'open' && submission && !period.allowEditAfterSubmit
          ? t('wishes.lockedAfterSubmit')
          : t('wishes.lockedText', { month, date: deadline })}
      </p>
    </div>
  )
}

function WishEditor({
  period,
  submission,
  shiftTypes,
  onSubmitted,
}: {
  period: WishPeriod
  submission: WishSubmission | null
  shiftTypes: ShiftTypeOption[]
  onSubmitted: () => void
}) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const queryClient = useQueryClient()
  const today = isoDateInTimeZone(new Date(), employment.hospital.timezone)
  const editability = wishPlanEditability(period, submission)
  const editable = editability.editable

  const initial = useMemo(() => new Map((submission?.wishes ?? []).map((w) => [w.date, w])), [submission])
  const [wishes, setWishes] = useState<Map<ISODate, Wish>>(initial)
  const [note, setNote] = useState(submission?.note ?? '')
  const [brush, setBrush] = useState<Brush>('free')
  const [preferredShift, setPreferredShift] = useState<string | null>(shiftTypes[0]?.id ?? null)
  const [detail, setDetail] = useState<Wish | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shiftCodes = useMemo(() => new Map(shiftTypes.map((s) => [s.id, s.code])), [shiftTypes])
  const sorted = useMemo(() => [...wishes.values()].sort((a, b) => a.date.localeCompare(b.date)), [wishes])
  const counts = countByType(sorted)
  const dirty = !wishesEqual(sorted, initial.values()) || (note.trim() || null) !== (submission?.note ?? null)

  const submit = useMutation({
    mutationFn: () => wishRepository.submit(period.id, sorted, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mySubmission(period.id, employment.employeeId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(employment.employeeId) })
      onSubmitted()
    },
    onError: (e) => {
      const kind = toAppError(e).kind
      setError(kind === 'validation' ? t('wishes.errorRules') : t(`errors.${kind}`))
    },
  })

  const onDayTap = (date: ISODate) => {
    if (!editable) {
      const w = wishes.get(date)
      if (w) setDetail(w)
      return
    }
    setError(null)
    setWishes((prev) => applyWish(prev, date, brush, preferredShift))
  }

  const setWishNote = (date: ISODate, value: string) =>
    setWishes((prev) => {
      const next = new Map(prev)
      const w = next.get(date)
      if (w) next.set(date, { ...w, note: value })
      return next
    })

  return (
    <>
      <DeadlineBanner period={period} submission={submission} editable={editable} />

      <p className="flex items-start gap-2 px-1 text-sm text-text-3">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('wishes.notAPromise')}
      </p>

      {!editable && !submission && (
        <Card>
          <EmptyState compact icon={<CalendarHeart />} title={t('wishes.noneSubmitted')} />
        </Card>
      )}

      {editable && <p className="px-1 text-[15px] font-medium text-text-2">{t('wishes.howTo')}</p>}

      <WishCalendar
        periodStart={period.periodStart}
        periodEnd={period.periodEnd}
        wishes={wishes}
        today={today}
        shiftCodes={shiftCodes}
        onDayTap={onDayTap}
        interactive={editable}
      />

      {/* Legend + counters */}
      <ul className="flex flex-wrap gap-2 px-1" aria-label={t('schedule.legend')}>
        {WISH_TYPES.map((type) => (
          <li key={type} className="flex items-center gap-1.5 text-[13px] text-text-2">
            <span className={cn('size-2.5 rounded-full', wishStyles[type].solid)} aria-hidden />
            {t(`wishType.${type}`)}
            {counts[type] > 0 && <span className="font-semibold text-text tabular">{counts[type]}</span>}
          </li>
        ))}
      </ul>

      {sorted.length > 0 && (
        <section>
          <SectionTitle>{t('wishes.myWishes', { count: sorted.length })}</SectionTitle>
          <Card padding="none" className="divide-y divide-border/70 overflow-hidden">
            {sorted.map((w) => (
              <div key={w.date} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3 sm:w-64">
                  <span className="w-24 shrink-0 text-[15px] font-semibold">{fmt.dateShort(w.date)}</span>
                  <WishPill type={w.type} shiftCode={w.shiftTypeId ? shiftCodes.get(w.shiftTypeId) : null} short />
                </div>
                {editable ? (
                  <Input
                    value={w.note ?? ''}
                    maxLength={300}
                    onChange={(e) => setWishNote(w.date, e.target.value)}
                    placeholder={t('wishes.notePlaceholder')}
                    aria-label={t('wishes.noteFor', { date: fmt.dateShort(w.date) })}
                    className="h-10 flex-1 text-sm"
                  />
                ) : (
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-text-2">{w.note}</span>
                    {w.status && <WishStatusBadge status={w.status} />}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      {(editable || submission?.note) && (
        <Field label={t('wishes.generalNote')} htmlFor="wish-note" optional optionalLabel={t('common.optional')}>
          <Textarea id="wish-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} disabled={!editable} rows={2} placeholder={t('wishes.generalNotePlaceholder')} />
        </Field>
      )}

      {/* Sticky action bar: brush + submit – reachable with the thumb */}
      {editable && (
        <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
          <div className="space-y-3 rounded-[24px] border border-border/70 bg-surface/90 p-3 shadow-lg backdrop-blur-xl sm:p-4">
            <WishPalette brush={brush} onBrush={setBrush} shiftTypes={shiftTypes} preferredShiftId={preferredShift} onPreferredShift={setPreferredShift} />
            {error && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text" role="alert">
                {error}
              </p>
            )}
            {submission && !dirty ? (
              <p className="flex items-center justify-center gap-2 py-1 text-sm font-semibold text-success-text">
                <CheckCircle2 className="size-4" aria-hidden />
                {t('wishes.upToDate')}
              </p>
            ) : (
              <Button size="lg" fullWidth loading={submit.isPending} onClick={() => submit.mutate()}>
                {submission ? t('wishes.resubmit', { count: sorted.length }) : t('wishes.submit', { count: sorted.length })}
              </Button>
            )}
          </div>
        </div>
      )}

      <Sheet open={!!detail} onClose={() => setDetail(null)} closeLabel={t('common.close')} title={detail ? fmt.dateLong(detail.date) : ''}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <WishPill type={detail.type} shiftCode={detail.shiftTypeId ? shiftCodes.get(detail.shiftTypeId) : null} />
              {detail.status && <WishStatusBadge status={detail.status} />}
            </div>
            {detail.note && (
              <p className="flex items-start gap-2 rounded-2xl bg-surface-2/70 px-4 py-3 text-[15px]">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                {detail.note}
              </p>
            )}
            {detail.reviewNote && (
              <div className="rounded-2xl bg-primary-soft px-4 py-3 text-[15px] text-primary-text">
                <p className="text-xs font-semibold uppercase opacity-80">{t('wishes.reviewNote')}</p>
                {detail.reviewNote}
              </div>
            )}
            <Badge tone="neutral">{t('wishes.notAPromiseShort')}</Badge>
          </div>
        )}
      </Sheet>
    </>
  )
}
