import { ArrowDown, ArrowLeftRight, Check, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { errorMessageKey, toAppError } from '@/core/errors'
import { swapAction, type ShiftSwap, type SwapShift } from '@/domain/swaps'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Card, Textarea, cn, useToast, type Tone } from '@/ui'
import { useSwapMutations } from './useSwaps'
import { useWarningText } from './warnings'

const STATUS_TONE: Record<ShiftSwap['status'], Tone> = {
  pending_partner: 'warning',
  pending_lead: 'primary',
  approved: 'success',
  declined: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
}

export function ShiftLine({ label, shift }: { label: string; shift: SwapShift | null }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-2.5">
      <span className={cn('h-9 w-1.5 shrink-0 rounded-full', shift ? dayKindStyles[shift.category ?? 'other'].solid : 'bg-border-strong')} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-text-3">{label}</span>
        <span className="block truncate text-[15px] font-medium">
          {shift ? (shift.shiftName ?? t('dayKind.other')) : t('swaps.nothingInReturn')}
        </span>
        {shift && <span className="block text-sm text-text-3 tabular">{`${fmt.dateShort(shift.date)} · ${fmt.timeRange(shift.startsAt, shift.endsAt)}`}</span>}
      </span>
    </div>
  )
}

export function SwapCard({ swap }: { swap: ShiftSwap }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const m = useSwapMutations()
  const warning = useWarningText()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const action = swapAction(swap)
  const handover = !swap.partnerShift
  const busy = m.respond.isPending || m.decide.isPending || m.cancel.isPending

  const fail = (e: unknown) => {
    const err = toAppError(e)
    toast.show({
      tone: 'error',
      title: t('errors.title'),
      description: err.kind === 'conflict' ? t('swaps.conflict') : err.kind === 'validation' ? t('swaps.noLongerPossible') : t(errorMessageKey(e)),
    })
  }
  const done = (title: string, description?: string) => () => toast.show({ tone: 'success', title, description })

  const statusText = swap.expired ? t('swaps.status.expired') : t(`swaps.status.${swap.status}`)
  const title = handover
    ? t('swaps.handoverTitle', { from: swap.requesterName, to: swap.partnerName })
    : t('swaps.swapTitle', { a: swap.requesterName, b: swap.partnerName })

  return (
    <Card padding="sm" className="sm:p-5" data-testid="swap-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            {handover ? <ArrowDown className="size-5" /> : <ArrowLeftRight className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[16px] leading-snug font-semibold">{title}</p>
            <p className="truncate text-sm text-text-3">
              {swap.unitName} · {fmt.relative(swap.createdAt)}
            </p>
          </div>
        </div>
        <Badge tone={swap.expired ? 'neutral' : STATUS_TONE[swap.status]}>{statusText}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ShiftLine label={t('swaps.gives', { name: swap.requesterName })} shift={swap.shift} />
        <ShiftLine label={t('swaps.gives', { name: swap.partnerName })} shift={swap.partnerShift} />
      </div>

      {swap.note && <p className="mt-3 text-sm text-text-2">„{swap.note}“</p>}
      {swap.decisionNote && <p className="mt-3 text-sm text-text-2">{t('swaps.leadNote', { note: swap.decisionNote })}</p>}

      {swap.warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {swap.warnings.map((w) => (
            <Badge key={w} tone="warning">
              {warning(w, swap)}
            </Badge>
          ))}
        </div>
      )}

      {action === 'decide' && rejecting && (
        <div className="mt-4">
          <Textarea
            id={`reason-${swap.id}`}
            aria-label={t('swaps.reason')}
            placeholder={t('swaps.reasonPlaceholder')}
            value={reason}
            maxLength={300}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      {action && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {action === 'respond' && (
            <>
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} disabled={busy}
                onClick={() => m.respond.mutateAsync({ id: swap.id, accept: false }).then(done(t('swaps.declinedToast')), fail)}>
                {t('swaps.decline')}
              </Button>
              <Button size="sm" icon={<Check className="size-4" />} loading={m.respond.isPending && m.respond.variables.accept}
                disabled={busy}
                onClick={() => m.respond.mutateAsync({ id: swap.id, accept: true }).then(done(t('swaps.acceptedToast'), t('swaps.acceptedHint')), fail)}>
                {t('swaps.accept')}
              </Button>
            </>
          )}
          {action === 'decide' &&
            (rejecting ? (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" variant="danger" loading={m.decide.isPending} disabled={busy}
                  onClick={() => m.decide.mutateAsync({ id: swap.id, approve: false, note: reason.trim() || null }).then(done(t('swaps.rejectedToast')), fail)}>
                  {t('swaps.reject')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} disabled={busy} onClick={() => setRejecting(true)}>
                  {t('swaps.reject')}
                </Button>
                <Button size="sm" icon={<Check className="size-4" />} loading={m.decide.isPending} disabled={busy}
                  onClick={() => m.decide.mutateAsync({ id: swap.id, approve: true, note: null }).then(done(t('swaps.approvedToast'), t('swaps.approvedHint')), fail)}>
                  {t('swaps.approve')}
                </Button>
              </>
            ))}
          {action === 'cancel' && (
            <Button size="sm" variant="ghost" loading={m.cancel.isPending} disabled={busy}
              onClick={() => m.cancel.mutateAsync(swap.id).then(done(t('swaps.cancelledToast')), fail)}>
              {t('swaps.cancel')}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
