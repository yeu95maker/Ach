'use client'
import { FileUp, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { PROVIDER_TYPES, type ProviderStatus, type ProviderType } from '@/lib/types'
import { toast } from './Toaster'
import { Alert, Button, Card, Field, Input, Select, Textarea } from './ui'

export interface OwnProvider {
  id: string
  display_name: string
  provider_type: ProviderType
  country: string
  city: string
  about: string
  status: ProviderStatus
  status_note: string | null
}

export function ProviderProfileForm({ provider, userId, referralCode = '' }: { provider: OwnProvider | null; userId: string; referralCode?: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [f, setF] = useState({
    display_name: provider?.display_name ?? '',
    provider_type: provider?.provider_type ?? ('private_seller' as ProviderType),
    country: provider?.country ?? 'Zimbabwe',
    city: provider?.city ?? 'Harare',
    about: provider?.about ?? '',
  })
  const [referral, setReferral] = useState(referralCode)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const supabase = supabaseBrowser()
    const { error } = provider
      ? await supabase.from('providers').update(f).eq('id', provider.id)
      : await supabase.from('providers').insert({ ...f, owner_id: userId, referral_code: referral.trim() || null })
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: t('common.saved'), tone: 'success' })
    router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label={t('onboarding.displayName')} hint={t('onboarding.displayNameHint')}>
        <Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} required minLength={2} maxLength={120} />
      </Field>
      <Field label={t('onboarding.providerType')}>
        <Select value={f.provider_type} onChange={(e) => setF({ ...f, provider_type: e.target.value as ProviderType })}>
          {PROVIDER_TYPES.map((p) => <option key={p} value={p}>{t(`providerType.${p}`)}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('filters.country')}><Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} required /></Field>
        <Field label={t('filters.city')}><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} required /></Field>
      </div>
      <Field label={t('provider.about')}>
        <Textarea value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} maxLength={2000} rows={3} />
      </Field>
      {!provider && (
        <Field label={t('referral.label')} hint={t('referral.hint')}>
          <Input value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" />
        </Field>
      )}
      <Button type="submit" disabled={busy}>{provider ? t('common.save') : t('onboarding.createProfile')}</Button>
    </form>
  )
}

export function VerificationForm({ provider, userId, email }: { provider: OwnProvider; userId: string; email: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const business = ['agent', 'developer', 'company'].includes(provider.provider_type)
  const [f, setF] = useState({
    legal_name: '', contact_phone: '', contact_email: email, id_document_type: 'national_id', id_document_number: '',
    business_name: business ? provider.display_name : '', business_registration_number: '', agent_license_number: '',
  })
  const [docs, setDocs] = useState<{ path: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function upload(files: FileList | null) {
    if (!files) return
    const supabase = supabaseBrowser()
    for (const file of Array.from(files).slice(0, 10 - docs.length)) {
      const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
      const { error } = await supabase.storage.from('verification-docs').upload(path, file, { contentType: file.type })
      if (error) toast({ text: t('error.upload'), tone: 'error' })
      else setDocs((d) => [...d, { path, name: file.name }])
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabaseBrowser().rpc('submit_provider_verification', { p: { ...f, document_paths: docs.map((d) => d.path) } })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    toast({ text: t('onboarding.submitted'), tone: 'success' })
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert tone="info">{t('onboarding.privacy')}</Alert>
      <Field label={t('onboarding.legalName')}><Input value={f.legal_name} onChange={set('legal_name')} required minLength={2} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('onboarding.phone')}><Input type="tel" value={f.contact_phone} onChange={set('contact_phone')} required placeholder="+263 …" /></Field>
        <Field label={t('auth.email')}><Input type="email" value={f.contact_email} onChange={set('contact_email')} required /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('onboarding.idType')}>
          <Select value={f.id_document_type} onChange={set('id_document_type')}>
            {(['national_id', 'passport', 'drivers_license'] as const).map((d) => <option key={d} value={d}>{t(`idType.${d}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('onboarding.idNumber')}><Input value={f.id_document_number} onChange={set('id_document_number')} required minLength={3} /></Field>
      </div>
      {business && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('onboarding.businessName')}><Input value={f.business_name} onChange={set('business_name')} /></Field>
          <Field label={t('onboarding.registration')}><Input value={f.business_registration_number} onChange={set('business_registration_number')} /></Field>
          {provider.provider_type === 'agent' && (
            <Field label={t('onboarding.agentLicense')} hint={t('onboarding.agentLicenseHint')}><Input value={f.agent_license_number} onChange={set('agent_license_number')} /></Field>
          )}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700">{t('onboarding.documents')}</p>
        <p className="mb-2 text-xs text-gray-500">{t('onboarding.documentsHint')}</p>
        <ul className="mb-2 space-y-1.5">
          {docs.map((d) => (
            <li key={d.path} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="truncate">{d.name}</span>
              <button type="button" onClick={() => setDocs(docs.filter((x) => x.path !== d.path))} aria-label={t('common.delete')}><Trash2 className="size-4 text-gray-500" /></button>
            </li>
          ))}
        </ul>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
          <FileUp className="size-4" /> {t('onboarding.upload')}
          <input type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" size="lg" disabled={busy}>{t('onboarding.submit')}</Button>
    </form>
  )
}

export function OnboardingShell({ children, step }: { children: React.ReactNode; step: number }) {
  const { t } = useI18n()
  const steps = [t('onboarding.step1'), t('onboarding.step2'), t('onboarding.step3')]
  return (
    <div className="space-y-5">
      <ol className="flex gap-2">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold ${i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-500'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Card className="p-5">{children}</Card>
    </div>
  )
}
