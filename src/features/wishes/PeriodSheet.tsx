import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, endOfMonth, format, parse } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toAppError } from '@/core/errors'
import { wishRepository, type UnitOption } from '@/data/wishRepository'
import { fromISODate, toISODate } from '@/domain/dates'
import type { WishPeriod } from '@/domain/wishes'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Select, Sheet, useToast } from '@/ui'

const DEFAULT_DEADLINE_DAYS = 21

const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

/** Default deadline: 21 days before the period starts, 23:59 – never in the past. */
function defaultDeadline(periodStart: Date) {
  const d = addDays(periodStart, -DEFAULT_DEADLINE_DAYS)
  d.setHours(23, 59, 0, 0)
  const min = addDays(new Date(), 1)
  return d < min ? min : d
}

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-surface-2/70 px-4 py-3">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-sm text-text-3">{hint}</span>}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
    </label>
  )
}

/** Create a wish period, or control an existing one (deadline, open, lock, reopen). */
export function PeriodSheet({
  open,
  onClose,
  period,
  units,
}: {
  open: boolean
  onClose: () => void
  period: WishPeriod | null
  units: UnitOption[]
}) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const queryClient = useQueryClient()

  const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
  const [unitId, setUnitId] = useState(period?.unitId ?? units[0]?.id ?? '')
  const [month, setMonth] = useState(format(period ? fromISODate(period.periodStart) : nextMonth, 'yyyy-MM'))
  const [deadline, setDeadline] = useState(toLocalInput(period?.deadlineAt ?? defaultDeadline(nextMonth)))
  const [allowEdit, setAllowEdit] = useState(period?.allowEditAfterSubmit ?? true)
  const [openNow, setOpenNow] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const done = (title: string) => {
    void queryClient.invalidateQueries({ queryKey: ['wish-periods'] })
    toast.show({ tone: 'success', title })
    onClose()
  }
  const fail = (e: unknown) => setError(t(`errors.${toAppError(e).kind}`))

  const create = useMutation({
    mutationFn: async () => {
      const start = parse(month, 'yyyy-MM', new Date())
      const id = await wishRepository.createPeriod({
        hospitalId: employment.hospital.id,
        unitId,
        periodStart: toISODate(start),
        periodEnd: toISODate(endOfMonth(start)),
        deadlineAt: new Date(deadline),
        allowEditAfterSubmit: allowEdit,
      })
      if (openNow) await wishRepository.updatePeriod(id, { status: 'open' })
    },
    onSuccess: () => done(openNow ? t('wishes.manage.createdOpen') : t('wishes.manage.created')),
    onError: fail,
  })

  const update = useMutation({
    mutationFn: (status?: 'open' | 'locked') =>
      wishRepository.updatePeriod(period!.id, { deadlineAt: new Date(deadline), allowEditAfterSubmit: allowEdit, ...(status ? { status } : {}) }),
    onSuccess: (_, status) =>
      done(status === 'open' ? t('wishes.manage.opened') : status === 'locked' ? t('wishes.manage.locked') : t('wishes.manage.saved')),
    onError: fail,
  })

  const deadlineInPast = new Date(deadline) <= new Date()
  const busy = create.isPending || update.isPending

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={period ? t('wishes.manage.editTitle') : t('wishes.manage.createTitle')}
      description={period ? `${period.unitName} · ${t(`wishPeriodStatus.${period.status}`)}` : t('wishes.manage.createHint')}
      footer={
        period ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {period.status === 'open' ? (
              <Button variant="secondary" size="lg" loading={update.isPending && update.variables === 'locked'} disabled={busy} onClick={() => update.mutate('locked')}>
                {t('wishes.manage.lockNow')}
              </Button>
            ) : (
              <Button variant="secondary" size="lg" disabled={busy || deadlineInPast} loading={update.isPending && update.variables === 'open'} onClick={() => update.mutate('open')}>
                {period.status === 'locked' ? t('wishes.manage.reopen') : t('wishes.manage.openNow')}
              </Button>
            )}
            <Button size="lg" loading={update.isPending && update.variables === undefined} disabled={busy} onClick={() => update.mutate(undefined)}>
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <Button size="lg" fullWidth loading={create.isPending} disabled={!unitId || deadlineInPast} onClick={() => create.mutate()}>
            {openNow ? t('wishes.manage.createAndOpen') : t('wishes.manage.createDraft')}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {!period && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('schedule.unit')} htmlFor="wp-unit">
              <Select id="wp-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('wishes.manage.month')} htmlFor="wp-month">
              <Input
                id="wp-month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value)
                  setDeadline(toLocalInput(defaultDeadline(parse(e.target.value, 'yyyy-MM', new Date()))))
                }}
              />
            </Field>
          </div>
        )}
        <Field
          label={t('wishes.manage.deadline')}
          htmlFor="wp-deadline"
          hint={period?.status === 'locked' ? t('wishes.manage.reopenHint') : t('wishes.manage.deadlineHint')}
          error={deadlineInPast ? t('wishes.manage.deadlinePast') : null}
        >
          <Input id="wp-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Toggle id="wp-allow" checked={allowEdit} onChange={setAllowEdit} label={t('wishes.manage.allowEdit')} hint={t('wishes.manage.allowEditHint')} />
        {!period && <Toggle id="wp-open" checked={openNow} onChange={setOpenNow} label={t('wishes.manage.openImmediately')} hint={t('wishes.manage.openImmediatelyHint')} />}
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
