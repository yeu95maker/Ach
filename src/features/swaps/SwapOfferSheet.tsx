import { ArrowDown, ArrowLeftRight, Check, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { PersonAvatar } from '@/components/PersonAvatar'
import { QueryError } from '@/components/QueryState'
import { dayKindStyles } from '@/components/dayKindStyles'
import { errorMessageKey, toAppError } from '@/core/errors'
import { scheduleRepository } from '@/data/scheduleRepository'
import { groupOptions, type SwapOption } from '@/domain/swaps'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, EmptyState, Field, Sheet, SkeletonCard, Textarea, cn, useToast } from '@/ui'
import { useSwapMutations, useSwapOptions } from './useSwaps'
import { useWarningText } from './warnings'

const keyOf = (o: SwapOption) => `${o.partnerId}:${o.partnerShift?.entryId ?? ''}`

/** "Dienst tauschen": pick a colleague and, optionally, one of their shifts in return. */
export function SwapOfferSheet({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const warning = useWarningText()
  const entry = useQuery({ queryKey: ['roster-entry', entryId], queryFn: () => scheduleRepository.fetchEntry(entryId!), enabled: !!entryId })
  const options = useSwapOptions(entryId)
  const { request } = useSwapMutations()
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const groups = useMemo(() => groupOptions(options.data ?? []), [options.data])
  const choice = (options.data ?? []).find((o) => keyOf(o) === picked) ?? null

  const close = () => {
    setPicked(null)
    setNote('')
    onClose()
  }

  const send = () => {
    if (!entryId || !choice) return
    void request
      .mutateAsync({ entryId, partnerId: choice.partnerId, partnerEntryId: choice.partnerShift?.entryId ?? null, note: note.trim() || null })
      .then(
        () => {
          toast.show({ tone: 'success', title: t('swaps.sent'), description: t('swaps.sentHint', { name: choice.firstName }) })
          close()
        },
        (e: unknown) =>
          toast.show({
            tone: 'error',
            title: t('errors.title'),
            description: toAppError(e).kind === 'conflict' ? t('swaps.conflict') : t(errorMessageKey(e)),
          }),
      )
  }

  const e = entry.data
  return (
    <Sheet
      open={!!entryId}
      onClose={close}
      closeLabel={t('common.close')}
      size="lg"
      title={t('swaps.offerTitle')}
      description={
        e?.startsAt && e.endsAt
          ? `${e.shiftType?.name ?? t('dayKind.other')} · ${fmt.dateShort(e.date)} · ${fmt.timeRange(e.startsAt, e.endsAt)}`
          : t('swaps.offerHint')
      }
      footer={
        <div className="flex w-full flex-col gap-3">
          <Field label={t('swaps.note')} htmlFor="swap-note" optional optionalLabel={t('common.optional')}>
            <Textarea id="swap-note" rows={2} maxLength={300} value={note} placeholder={t('swaps.notePlaceholder')} onChange={(ev) => setNote(ev.target.value)} />
          </Field>
          <Button fullWidth disabled={!choice} loading={request.isPending} onClick={send} icon={<ArrowLeftRight className="size-4" />}>
            {choice ? t('swaps.sendTo', { name: choice.firstName }) : t('swaps.pickFirst')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-text-2">{t('swaps.offerHint')}</p>
      {options.isLoading && <SkeletonCard lines={4} />}
      {options.error && <QueryError error={options.error} onRetry={() => void options.refetch()} />}
      {options.data && groups.length === 0 && <EmptyState icon={<UsersRound />} title={t('swaps.noOptions')} description={t('swaps.noOptionsHint')} />}

      <div className="space-y-5" role="radiogroup" aria-label={t('swaps.offerTitle')}>
        {groups.map((g) => (
          <section key={g.partner.partnerId}>
            <div className="mb-2 flex items-center gap-3">
              <PersonAvatar person={g.partner} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{`${g.partner.firstName} ${g.partner.lastName}`}</p>
                <p className="truncate text-sm text-text-3">{g.partner.jobTitle}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {[...(g.handover ? [g.handover] : []), ...g.swaps].map((o) => {
                const k = keyOf(o)
                const on = picked === k
                const s = o.partnerShift
                return (
                  <li key={k}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPicked(k)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                        on ? 'border-primary bg-primary-soft/60' : 'border-border bg-surface hover:bg-surface-2',
                      )}
                    >
                      {s ? (
                        <span className={cn('h-9 w-1.5 shrink-0 rounded-full', dayKindStyles[s.category ?? 'other'].solid)} aria-hidden />
                      ) : (
                        <ArrowDown className="size-5 shrink-0 text-text-3" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">
                          {s ? t('swaps.swapFor', { shift: s.shiftName ?? s.shiftCode ?? '' }) : t('swaps.handoverOnly')}
                        </span>
                        <span className="block text-sm text-text-3 tabular">
                          {s ? `${fmt.dateShort(s.date)} · ${fmt.timeRange(s.startsAt, s.endsAt)}` : t('swaps.handoverHint', { name: o.firstName })}
                        </span>
                        {o.warnings.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {o.warnings.map((w) => (
                              <Badge key={w} tone="warning">
                                {warning(w, undefined, o.firstName)}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </span>
                      {on && <Check className="size-5 shrink-0 text-primary-text" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
