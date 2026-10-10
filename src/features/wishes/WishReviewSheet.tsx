import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, Check, Clock3, StickyNote, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { errorMessageKey } from '@/core/errors'
import { wishRepository, type WishOverviewItem } from '@/data/wishRepository'
import type { RosterEntry } from '@/domain/types'
import { compareWithPlan } from '@/domain/wishes'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Field, Input, Sheet, useToast } from '@/ui'
import { WishPill, WishStatusBadge } from './wishStyles'

export function WishReviewSheet({
  wish,
  planned,
  canReview,
  onClose,
}: {
  wish: WishOverviewItem | null
  planned: RosterEntry | null
  canReview: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')

  const review = useMutation({
    mutationFn: (status: 'under_review' | 'considered' | 'not_considered') => wishRepository.review([wish!.id], status, note.trim() || null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wish-overview'] })
      toast.show({ tone: 'success', title: t('wishes.manage.reviewed', { count: 1 }) })
      setNote('')
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const match = wish
    ? compareWithPlan(wish, planned ? { kind: planned.kind, category: planned.shiftType?.category ?? null, shiftTypeId: planned.shiftType?.id ?? null } : null)
    : null

  return (
    <Sheet open={!!wish} onClose={onClose} closeLabel={t('common.close')} title={wish ? fmt.dateLong(wish.date) : ''}>
      {wish && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <PersonAvatar person={wish} />
            <div>
              <p className="text-[16px] font-semibold">{`${wish.firstName} ${wish.lastName}`}</p>
              <p className="text-sm text-text-3">
                {wish.jobTitle} · {wish.unitName}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="mb-2 text-xs font-semibold text-text-3 uppercase">{t('wishes.manage.wish')}</p>
              <WishPill type={wish.type} shiftCode={wish.shiftCode} />
              <div className="mt-2">
                <WishStatusBadge status={wish.status} />
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-border-strong p-4">
              <p className="mb-2 text-xs font-semibold text-text-3 uppercase">{t('wishes.manage.planned')}</p>
              {planned ? (
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  <CalendarCheck2 className="size-4 text-text-3" aria-hidden />
                  {planned.kind === 'off' ? t('dayKind.off') : `${planned.shiftType?.code ?? ''} · ${planned.shiftType?.name ?? ''}`}
                </p>
              ) : (
                <p className="text-sm text-text-3">{t('wishes.manage.nothingPlanned')}</p>
              )}
              {match && match !== 'open' && (
                <Badge tone={match === 'match' ? 'success' : 'danger'} className="mt-2">
                  {match === 'match' ? t('wishes.match') : t('wishes.mismatch')}
                </Badge>
              )}
              {planned?.scheduleStatus === 'draft' && <p className="mt-2 text-xs text-text-3">{t('schedule.statusDraft')}</p>}
            </div>
          </div>

          {(wish.note || wish.submissionNote) && (
            <div className="space-y-2">
              {wish.note && (
                <p className="flex items-start gap-2 rounded-2xl bg-surface-2/70 px-4 py-3 text-[15px]">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
                  {wish.note}
                </p>
              )}
              {wish.submissionNote && (
                <p className="rounded-2xl bg-surface-2/70 px-4 py-3 text-sm text-text-2">
                  <span className="font-semibold">{t('wishes.generalNote')}:</span> {wish.submissionNote}
                </p>
              )}
            </div>
          )}

          {canReview && (
            <>
              <Field label={t('wishes.manage.reviewNote')} htmlFor="review-note" optional optionalLabel={t('common.optional')}>
                <Input id="review-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t('wishes.manage.reviewNotePlaceholder')} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="secondary" icon={<Clock3 className="size-4 text-warning" />} loading={review.isPending && review.variables === 'under_review'} onClick={() => review.mutate('under_review')}>
                  {t('wishStatus.under_review')}
                </Button>
                <Button variant="secondary" icon={<X className="size-4 text-danger" />} loading={review.isPending && review.variables === 'not_considered'} onClick={() => review.mutate('not_considered')}>
                  {t('wishStatus.not_considered')}
                </Button>
                <Button icon={<Check className="size-4" />} loading={review.isPending && review.variables === 'considered'} onClick={() => review.mutate('considered')}>
                  {t('wishStatus.considered')}
                </Button>
              </div>
              <p className="text-xs text-text-3">{t('wishes.manage.reviewHint')}</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
