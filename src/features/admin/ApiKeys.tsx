import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { config } from '@/core/config'
import { errorMessageKey } from '@/core/errors'
import { integrationRepository, type IntegrationSource } from '@/data/integrationRepository'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { Badge, Button, Field, Input, Sheet, useToast } from '@/ui'

export const rosterSyncUrl = () => `${config?.supabaseUrl ?? ''}/functions/v1/roster-sync`

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          icon={<Copy className="size-[18px]" />}
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => toast.show({ tone: 'success', title: t('integration.api.copied') }),
              () => document.getElementById(id)?.focus(),
            )
          }
        >
          {t('integration.api.copy')}
        </Button>
      </div>
    </Field>
  )
}

/** Keys for the Dienstwerk-Schnittstelle of one import profile. */
export function ApiKeys({ source }: { source: IntegrationSource }) {
  const { t } = useTranslation()
  const fmt = useHospitalFormatter()
  const toast = useToast()
  const keys = useQuery({ queryKey: ['integration-api-keys', source.id], queryFn: () => integrationRepository.listApiKeys(source.id) })
  const [label, setLabel] = useState('')
  const [asking, setAsking] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const onError = (e: unknown) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })

  const create = useMutation({
    mutationFn: () => integrationRepository.createApiKey(source.id, label.trim()),
    onSuccess: (r) => {
      setAsking(false)
      setLabel('')
      setCreated(r.key)
      void keys.refetch()
    },
    onError,
  })
  const revoke = useMutation({ mutationFn: (id: string) => integrationRepository.revokeApiKey(id), onSuccess: () => void keys.refetch(), onError })
  const active = (keys.data ?? []).filter((k) => !k.revokedAt)

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-text-2">{t('integration.api.intro')}</p>
      <CopyField id={`url-${source.id}`} label={t('integration.api.endpoint')} value={rosterSyncUrl()} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{t('integration.api.keys', { count: active.length })}</p>
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAsking(true)} disabled={active.length >= 5}>
          {t('integration.api.newKey')}
        </Button>
      </div>
      <ul className="space-y-1.5">
        {(keys.data ?? []).map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
            <KeyRound className="size-4 text-text-3" aria-hidden />
            <span className="font-mono">{k.prefix}…</span>
            {k.label && <span className="text-text-2">{k.label}</span>}
            <span className="text-xs text-text-3">
              {k.lastUsedAt ? t('integration.api.lastUsed', { when: fmt.relative(k.lastUsedAt) }) : t('integration.api.neverUsed')}
            </span>
            <span className="ml-auto">
              {k.revokedAt ? (
                <Badge tone="neutral">{t('integration.api.revoked')}</Badge>
              ) : (
                <Button size="sm" variant="ghost" icon={<ShieldOff className="size-4" />} loading={revoke.isPending && revoke.variables === k.id} onClick={() => revoke.mutate(k.id)}>
                  {t('integration.api.revoke')}
                </Button>
              )}
            </span>
          </li>
        ))}
        {keys.data?.length === 0 && <li className="text-sm text-text-3">{t('integration.api.noKeys')}</li>}
      </ul>

      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        closeLabel={t('common.close')}
        title={t('integration.api.newKey')}
        footer={
          <Button size="lg" fullWidth loading={create.isPending} onClick={() => create.mutate()}>
            {t('integration.api.create')}
          </Button>
        }
      >
        <Field label={t('integration.api.label')} htmlFor="api-key-label" optional optionalLabel={t('common.optional')} hint={t('integration.api.labelHint')}>
          <Input id="api-key-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Export-Server IT" />
        </Field>
      </Sheet>

      <Sheet open={!!created} onClose={() => setCreated(null)} closeLabel={t('common.close')} title={t('integration.api.createdTitle')}>
        {created && (
          <div className="space-y-4">
            <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-text">{t('integration.api.onlyOnce')}</p>
            <CopyField id="api-key-value" label={t('integration.api.key')} value={created} />
            <CopyField id="api-key-url" label={t('integration.api.endpoint')} value={rosterSyncUrl()} />
            <p className="text-sm text-text-2">{t('integration.api.howTo')}</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
