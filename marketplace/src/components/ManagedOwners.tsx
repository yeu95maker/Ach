'use client'
import { Copy, FileUp, Loader2, LogOut, Mail, MessageCircle, Plus, Store } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'
import { Button, Field, Input, Select, Textarea } from './ui'

const TYPES = ['private_seller', 'owner', 'developer', 'agent', 'company'] as const
const ID_TYPES = ['national_id', 'passport', 'drivers_license'] as const

/** Admin: create a profile for an owner without an account (verified with the papers they sent). */
export function ManagedOwnerForm({ userId }: { userId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [f, setF] = useState({
    display_name: '', provider_type: 'private_seller', city: 'Harare', about: '',
    contact_name: '', contact_phone: '', contact_email: '',
    legal_name: '', id_document_type: 'national_id', id_document_number: '',
  })
  const [docs, setDocs] = useState<{ path: string; name: string }[]>([])
  const [busy, setBusy] = useState<false | 'save' | 'list' | 'upload'>(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function upload(files: FileList | null) {
    if (!files) return
    setBusy('upload')
    const supabase = supabaseBrowser()
    for (const file of Array.from(files).slice(0, 10 - docs.length)) {
      const path = `${userId}/managed/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
      const { error } = await supabase.storage.from('verification-docs').upload(path, file, { contentType: file.type })
      if (error) toast({ text: t('error.upload'), tone: 'error' })
      else setDocs((d) => [...d, { path, name: file.name }])
    }
    setBusy(false)
  }

  async function save(startListing: boolean) {
    setBusy(startListing ? 'list' : 'save')
    const supabase = supabaseBrowser()
    const { data, error } = await supabase.rpc('admin_save_managed_owner', { p: { ...f, document_paths: docs.map((d) => d.path) } })
    if (error) {
      setBusy(false)
      return toast({ text: t(errorKey(error)), tone: 'error' })
    }
    if (startListing) {
      const { error: actError } = await supabase.rpc('admin_act_as', { p_provider: data })
      if (actError) {
        setBusy(false)
        return toast({ text: t(errorKey(actError)), tone: 'error' })
      }
      router.push('/provider/properties/new')
      router.refresh()
      return
    }
    setBusy(false)
    toast({ text: t('owners.created'), tone: 'success' })
    setF((x) => ({ ...x, display_name: '', about: '', contact_name: '', contact_phone: '', contact_email: '', legal_name: '', id_document_number: '' }))
    setDocs([])
    router.refresh()
  }

  const ready = f.display_name.trim().length >= 2 && (f.contact_phone.trim() || f.contact_email.trim()) && (f.id_document_number.trim() || docs.length > 0)
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(true) }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('owners.displayName')} hint={t('owners.displayNameHint')}>
          <Input required minLength={2} maxLength={120} value={f.display_name} onChange={set('display_name')} />
        </Field>
        <Field label={t('onboarding.providerType')}>
          <Select value={f.provider_type} onChange={set('provider_type')}>
            {TYPES.map((x) => <option key={x} value={x}>{t(`providerType.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('owners.contactName')}><Input maxLength={120} value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label={t('owners.city')}><Input maxLength={80} value={f.city} onChange={set('city')} /></Field>
        <Field label={t('owners.phone')} hint={t('owners.phoneHint')}><Input type="tel" maxLength={40} value={f.contact_phone} onChange={set('contact_phone')} /></Field>
        <Field label={t('auth.email')} hint={t('owners.emailHint')}><Input type="email" maxLength={200} value={f.contact_email} onChange={set('contact_email')} /></Field>
      </div>

      <fieldset className="space-y-3 rounded-xl bg-gray-50 p-3">
        <legend className="px-1 text-sm font-bold text-gray-700">{t('owners.papers')}</legend>
        <p className="text-sm text-gray-600">{t('owners.papersHint')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('onboarding.legalName')}><Input maxLength={160} value={f.legal_name} onChange={set('legal_name')} /></Field>
          <Field label={t('onboarding.idType')}>
            <Select value={f.id_document_type} onChange={set('id_document_type')}>
              {ID_TYPES.map((x) => <option key={x} value={x}>{t(`idType.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('onboarding.idNumber')}><Input maxLength={60} value={f.id_document_number} onChange={set('id_document_number')} /></Field>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-gray-300">
          {busy === 'upload' ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {t('owners.uploadPapers')}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => void upload(e.target.files)} />
        </label>
        {docs.length > 0 && <ul className="text-sm text-gray-700">{docs.map((d) => <li key={d.path}>✓ {d.name}</li>)}</ul>}
      </fieldset>

      <Field label={t('owners.about')}><Textarea rows={2} maxLength={2000} value={f.about} onChange={set('about')} /></Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready || !!busy}><Plus className="size-4" />{t('owners.createAndList')}</Button>
        <Button type="button" variant="secondary" disabled={!ready || !!busy} onClick={() => void save(false)}>{t('owners.createOnly')}</Button>
      </div>
    </form>
  )
}

/** Admin: per-owner actions – list for them, share the claim link. */
export function ManagedOwnerActions({ id, name, phone, email, claimUrl }: { id: string; name: string; phone: string | null; email: string | null; claimUrl: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const supabase = supabaseBrowser()

  async function manage() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_act_as', { p_provider: id })
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    router.push('/provider')
    router.refresh()
  }
  async function emailLink() {
    if (!window.confirm(t('owners.emailConfirm', { email: email ?? '' }))) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_claim_link', { p_provider: id, p_send_email: true })
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: t('owners.emailSent'), tone: 'success' })
    router.refresh()
  }
  const full = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url)
  const whatsapp = () => {
    if (!claimUrl) return
    const text = t('owners.whatsappText', { name, url: full(claimUrl) })
    const digits = (phone ?? '').replace(/\D/g, '').replace(/^0/, '263')
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void manage()} disabled={busy}><Store className="size-4" />{t('owners.manage')}</Button>
      {claimUrl && (
        <>
          <Button size="sm" variant="secondary" onClick={async () => {
            await navigator.clipboard?.writeText(full(claimUrl)).catch(() => {})
            toast({ text: t('partners.copied'), tone: 'success' })
          }}><Copy className="size-4" />{t('owners.copyClaim')}</Button>
          {phone && <Button size="sm" variant="secondary" onClick={whatsapp}><MessageCircle className="size-4" />WhatsApp</Button>}
          {email && <Button size="sm" variant="secondary" onClick={() => void emailLink()} disabled={busy}><Mail className="size-4" />{t('owners.emailClaim')}</Button>}
        </>
      )}
    </div>
  )
}

/** Shown on every page while an admin is acting for an owner. */
export function ActingBanner({ name }: { name: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div className="bg-gold-100 text-gray-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <span>{t('owners.actingFor', { name })}</span>
        <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 font-semibold underline"
          onClick={async () => {
            setBusy(true)
            await supabaseBrowser().rpc('admin_act_as', { p_provider: null })
            router.push('/admin?tab=owners')
            router.refresh()
          }}>
          <LogOut className="size-4" />{t('owners.stopActing')}
        </button>
      </div>
    </div>
  )
}

/** Owner: take over the profile an admin prepared. */
export function ClaimButton({ token }: { token: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button size="lg" block disabled={busy} onClick={async () => {
      setBusy(true)
      const { error } = await supabaseBrowser().rpc('claim_provider', { p_token: token })
      setBusy(false)
      if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
      toast({ text: t('claim.done'), tone: 'success' })
      router.push('/provider')
      router.refresh()
    }}>{t('claim.cta')}</Button>
  )
}
