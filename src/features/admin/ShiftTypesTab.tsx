import { useMutation } from '@tanstack/react-query'
import { Clock, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKindStyles } from '@/components/dayKindStyles'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { adminRepository, type AdminShiftType } from '@/data/adminRepository'
import type { ShiftCategory } from '@/domain/types'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Select, Sheet, SkeletonCard, cn, useToast } from '@/ui'
import { useAdminRefresh, useAdminShiftTypes, useOrganization } from './useAdmin'

const CATEGORIES: ShiftCategory[] = ['early', 'late', 'night', 'day', 'other']
type Draft = Omit<AdminShiftType, 'id'> & { id?: string }
const EMPTY: Draft = { unitId: null, code: '', name: '', category: 'early', startTime: '06:00', endTime: '14:00', breakMinutes: 30, isActive: true }

export function ShiftTypesTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const refresh = useAdminRefresh()
  const types = useAdminShiftTypes()
  const org = useOrganization()
  const [draft, setDraft] = useState<Draft | null>(null)

  const units = useMemo(() => (org.data ?? []).flatMap((d) => d.units), [org.data])
  const groups = useMemo(() => {
    const byUnit = new Map<string | null, AdminShiftType[]>()
    for (const s of types.data ?? []) byUnit.set(s.unitId, [...(byUnit.get(s.unitId) ?? []), s])
    return [...byUnit.entries()].sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : 0))
  }, [types.data])

  const save = useMutation({
    mutationFn: (d: Draft) => adminRepository.saveShiftType(employment.hospital.id, d),
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('admin.saved') })
      setDraft(null)
      void refresh()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const codeValid = !!draft && /^[A-Za-z0-9_-]{1,16}$/.test(draft.code.trim())
  const valid = !!draft && codeValid && !!draft.name.trim() && draft.startTime !== draft.endTime

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-[18px]" />} onClick={() => setDraft(EMPTY)}>
          {t('admin.shifts.add')}
        </Button>
      </div>

      {types.isLoading && <SkeletonCard lines={4} />}
      {types.error && <QueryError error={types.error} onRetry={() => void types.refetch()} />}
      {types.data?.length === 0 && (
        <Card>
          <EmptyState icon={<Clock />} title={t('admin.shifts.empty')} />
        </Card>
      )}

      {groups.map(([unitId, list]) => (
        <Card key={unitId ?? 'hospital'}>
          <CardHeader title={unitId ? (units.find((u) => u.id === unitId)?.name ?? '–') : t('admin.shifts.hospitalWide')} />
          <ul className="divide-y divide-border/70">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', dayKindStyles[s.category].soft, dayKindStyles[s.category].text)}>
                  {s.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{s.name}</span>
                    {!s.isActive && <Badge tone="warning">{t('admin.inactive')}</Badge>}
                  </span>
                  <span className="block text-sm text-text-2 tabular">
                    {s.startTime} – {s.endTime} · {t('admin.shifts.breakShort', { minutes: s.breakMinutes })}
                    {s.endTime <= s.startTime && ` · ${t('admin.shifts.overnight')}`}
                  </span>
                </span>
                <IconButton label={t('admin.edit')} onClick={() => setDraft(s)}>
                  <Pencil className="size-[18px]" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        closeLabel={t('common.close')}
        title={draft?.id ? t('admin.shifts.edit') : t('admin.shifts.add')}
        description={t('admin.shifts.hint')}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" loading={save.isPending} disabled={!valid} onClick={() => draft && save.mutate(draft)}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <Field label={t('admin.shifts.code')} htmlFor="st-code" error={draft.code && !codeValid ? t('admin.shifts.codeInvalid') : null}>
                <Input id="st-code" value={draft.code} maxLength={16} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="F" />
              </Field>
              <Field label={t('admin.org.name')} htmlFor="st-name">
                <Input id="st-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('dayKind.early')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('admin.shifts.category')} htmlFor="st-cat">
                <Select id="st-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ShiftCategory })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`dayKind.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('admin.shifts.appliesTo')} htmlFor="st-unit">
                <Select id="st-unit" value={draft.unitId ?? ''} onChange={(e) => setDraft({ ...draft, unitId: e.target.value || null })}>
                  <option value="">{t('admin.shifts.hospitalWide')}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label={t('news.from')} htmlFor="st-start">
                <Input id="st-start" type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
              </Field>
              <Field label={t('news.to')} htmlFor="st-end">
                <Input id="st-end" type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
              </Field>
              <Field label={t('admin.shifts.break')} htmlFor="st-break">
                <Input
                  id="st-break"
                  type="number"
                  min={0}
                  max={240}
                  step={5}
                  value={draft.breakMinutes}
                  onChange={(e) => setDraft({ ...draft, breakMinutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
                />
              </Field>
            </div>
            {draft.endTime <= draft.startTime && <p className="text-sm text-text-2">{t('admin.shifts.overnightHint')}</p>}
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 p-4">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="size-5 accent-[var(--color-primary)]" />
              <span className="text-[15px] font-medium">{t('admin.activeLabel')}</span>
            </label>
          </div>
        )}
      </Sheet>
    </div>
  )
}
