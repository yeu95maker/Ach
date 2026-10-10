import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Plug, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QueryError } from '@/components/QueryState'
import { errorMessageKey } from '@/core/errors'
import { integrationRepository, type IntegrationKind, type IntegrationSource } from '@/data/integrationRepository'
import type { DateFormat } from '@/domain/integration/types'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Select, Sheet, SkeletonCard, useToast } from '@/ui'
import { useAdminEmployees, useAdminShiftTypes, useOrganization } from './useAdmin'

type Draft = Omit<IntegrationSource, 'id'> & { id?: string }
const EMPTY: Draft = { unitId: null, name: '', kind: 'file', vendor: null, settings: { date_format: 'dmy' }, isActive: true }

function Mappings({ source }: { source: IntegrationSource }) {
  const { t } = useTranslation()
  const toast = useToast()
  const employees = useAdminEmployees()
  const types = useAdminShiftTypes()
  const org = useOrganization()
  const people = useQuery({ queryKey: ['integration-employee-mappings', source.id], queryFn: () => integrationRepository.fetchEmployeeMappings(source.id) })
  const codes = useQuery({ queryKey: ['integration-code-mappings', source.id], queryFn: () => integrationRepository.fetchCodeMappings(source.id) })
  const remove = useMutation({
    mutationFn: (id: string) => integrationRepository.removeEmployeeMapping(id),
    onSuccess: () => void people.refetch(),
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })
  const person = (id: string) => {
    const e = employees.data?.find((x) => x.employeeId === id)
    return e ? `${e.lastName}, ${e.firstName}` : '–'
  }
  const unitName = (id: string | null) => (id ? (org.data ?? []).flatMap((d) => d.units).find((u) => u.id === id)?.name ?? '–' : t('admin.shifts.hospitalWide'))
  const target = (c: { target: string; shiftTypeId: string | null }) =>
    c.target === 'shift' ? (types.data?.find((s) => s.id === c.shiftTypeId)?.code ?? '?') : c.target === 'off' ? t('dayKind.off') : t('integration.review.ignore')

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-semibold">{t('integration.admin.employeeMappings', { count: people.data?.length ?? 0 })}</p>
        <ul className="space-y-1.5">
          {(people.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-1.5 text-sm">
              <span className="font-mono text-text-2">{m.externalId}</span>
              <span className="text-text-3">→</span>
              <span className="min-w-0 flex-1 truncate">{person(m.employeeId)}</span>
              <IconButton label={t('integration.admin.removeMapping')} onClick={() => remove.mutate(m.id)} className="size-8">
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
          {people.data?.length === 0 && <li className="text-sm text-text-3">{t('integration.admin.noMappings')}</li>}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t('integration.admin.codeMappings', { count: codes.data?.length ?? 0 })}</p>
        <ul className="space-y-1.5">
          {(codes.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-1.5 text-sm">
              <span className="font-mono font-semibold">{c.externalCode}</span>
              <span className="text-text-3">→</span>
              <span className="flex-1">{target(c)}</span>
              <span className="truncate text-xs text-text-3">{unitName(c.unitId)}</span>
            </li>
          ))}
          {codes.data?.length === 0 && <li className="text-sm text-text-3">{t('integration.admin.noCodeMappings')}</li>}
        </ul>
      </div>
    </div>
  )
}

/** Verwaltung → Integrationen: import profiles per hospital. */
export function IntegrationsTab() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const org = useOrganization()
  const sources = useQuery({ queryKey: ['import-sources', employment.hospital.id], queryFn: () => integrationRepository.fetchSources(employment.hospital.id) })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [secret, setSecret] = useState('')
  const hasSecret = useQuery({
    queryKey: ['integration-secret', draft?.id],
    queryFn: () => integrationRepository.hasSecret(draft!.id!),
    enabled: !!draft?.id && draft.kind !== 'file',
  })
  const units = (org.data ?? []).flatMap((d) => d.units)

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      await integrationRepository.saveSource(employment.hospital.id, d)
      if (d.id && secret) await integrationRepository.setSecret(d.id, secret)
    },
    onSuccess: () => {
      toast.show({ tone: 'success', title: t('admin.saved') })
      setDraft(null)
      setSecret('')
      void sources.refetch()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  return (
    <div className="space-y-5">
      <Card className="border-accent/20 bg-accent-soft/40">
        <p className="text-sm text-text-2">{t('integration.admin.intro')}</p>
      </Card>
      <div className="flex justify-end">
        <Button icon={<Plus className="size-[18px]" />} onClick={() => setDraft(EMPTY)}>
          {t('integration.admin.add')}
        </Button>
      </div>
      {sources.isLoading && <SkeletonCard lines={3} />}
      {sources.error && <QueryError error={sources.error} onRetry={() => void sources.refetch()} />}
      {sources.data?.length === 0 && (
        <Card>
          <EmptyState icon={<Plug />} title={t('integration.admin.empty')} />
        </Card>
      )}
      {(sources.data ?? []).map((s) => (
        <Card key={s.id}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {s.name}
                <Badge tone={s.kind === 'file' ? 'success' : 'neutral'}>{t(`integration.kind.${s.kind}`)}</Badge>
                {!s.isActive && <Badge tone="warning">{t('admin.inactive')}</Badge>}
              </span>
            }
            subtitle={[s.vendor, s.unitId ? units.find((u) => u.id === s.unitId)?.name : t('admin.shifts.hospitalWide')].filter(Boolean).join(' · ')}
            action={
              <IconButton label={t('admin.edit')} onClick={() => setDraft(s)}>
                <Pencil className="size-[18px]" />
              </IconButton>
            }
          />
          {s.kind !== 'file' && <p className="text-sm text-warning-text">{t('integration.admin.notImplemented')}</p>}
          <Mappings source={s} />
        </Card>
      ))}

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        closeLabel={t('common.close')}
        title={draft?.id ? t('integration.admin.edit') : t('integration.admin.add')}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" loading={save.isPending} disabled={!draft?.name.trim()} onClick={() => draft && save.mutate(draft)}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label={t('admin.org.name')} htmlFor="int-name">
              <Input id="int-name" value={draft.name} maxLength={120} placeholder={t('integration.admin.namePlaceholder')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label={t('integration.admin.kind')} htmlFor="int-kind" hint={draft.kind === 'file' ? t('integration.admin.kindFileHint') : t('integration.admin.notImplemented')}>
              <Select id="int-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as IntegrationKind })}>
                {(['file', 'api', 'sftp'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`integration.kind.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('integration.admin.vendor')} htmlFor="int-vendor" optional optionalLabel={t('common.optional')} hint={t('integration.admin.vendorHint')}>
              <Input id="int-vendor" value={draft.vendor ?? ''} maxLength={120} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('admin.shifts.appliesTo')} htmlFor="int-unit">
                <Select id="int-unit" value={draft.unitId ?? ''} onChange={(e) => setDraft({ ...draft, unitId: e.target.value || null })}>
                  <option value="">{t('admin.shifts.hospitalWide')}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('integration.dateFormat')} htmlFor="int-df">
                <Select
                  id="int-df"
                  value={draft.settings.date_format ?? 'dmy'}
                  onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, date_format: e.target.value as DateFormat } })}
                >
                  <option value="dmy">TT.MM.JJJJ</option>
                  <option value="ymd">JJJJ-MM-TT</option>
                  <option value="mdy">MM/TT/JJJJ</option>
                </Select>
              </Field>
            </div>
            {draft.kind !== 'file' && draft.id && (
              <Field
                label={t('integration.admin.secret')}
                htmlFor="int-secret"
                optional
                optionalLabel={t('common.optional')}
                hint={hasSecret.data ? t('integration.admin.secretStored') : t('integration.admin.secretHint')}
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-3" aria-hidden />
                  <Input id="int-secret" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} className="pl-11" />
                </div>
              </Field>
            )}
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
