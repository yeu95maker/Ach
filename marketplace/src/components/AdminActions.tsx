'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ProviderStatus, PropertyStatus } from '@/lib/types'
import { toast } from './Toaster'
import { Button, Input } from './ui'

function useRpc() {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true)
    const { error } = await supabaseBrowser().rpc(fn, args)
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    toast({ text: t('common.saved'), tone: 'success' })
    router.refresh()
  }
  return { call, busy, t }
}

/** Approve / reject a provider verification, suspend / reinstate a provider. */
export function ProviderReview({ id, status }: { id: string; status: ProviderStatus }) {
  const { call, busy, t } = useRpc()
  const [note, setNote] = useState('')
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.note')} aria-label={t('admin.note')} />
      <div className="flex flex-wrap gap-2">
        {['pending', 'rejected', 'unverified'].includes(status) && (
          <>
            <Button size="sm" disabled={busy} onClick={() => call('admin_review_provider', { p_provider_id: id, p_approve: true, p_note: note || null })}>{t('admin.verify')}</Button>
            {status !== 'rejected' && <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={() => call('admin_review_provider', { p_provider_id: id, p_approve: false, p_note: note })}>{t('admin.reject')}</Button>}
          </>
        )}
        {status === 'suspended' ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => call('admin_set_provider_suspended', { p_provider_id: id, p_suspended: false, p_note: note || null })}>{t('admin.reinstate')}</Button>
        ) : (
          <Button size="sm" variant="danger" disabled={busy || !note.trim()} onClick={() => call('admin_set_provider_suspended', { p_provider_id: id, p_suspended: true, p_note: note })}>{t('admin.suspend')}</Button>
        )}
      </div>
      <p className="text-xs text-gray-500">{t('admin.noteRequired')}</p>
    </div>
  )
}

export function PropertyModeration({ id, status, isPremium }: { id: string; status: PropertyStatus; isPremium: boolean }) {
  const { call, busy, t } = useRpc()
  const [note, setNote] = useState('')
  const [early, setEarly] = useState(false)
  const moderate = (action: string) => call('admin_moderate_property', { p_id: id, p_action: action, p_note: note || null, p_early_access: early })
  return (
    <div className="space-y-2">
      {(status === 'pending' || status === 'active' || status === 'rejected') && (
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.reason')} aria-label={t('admin.reason')} />
      )}
      {(status === 'pending' || status === 'rejected') && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} className="size-4 accent-brand-600" />
          {t('admin.earlyAccess')}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {(status === 'pending' || status === 'rejected') && <Button size="sm" disabled={busy} onClick={() => moderate('approve')}>{t('admin.approve')}</Button>}
        {(status === 'pending' || status === 'active') && <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={() => moderate('reject')}>{t('admin.reject')}</Button>}
        {status !== 'removed' && status !== 'draft' && <Button size="sm" variant="danger" disabled={busy || !note.trim()} onClick={() => moderate('remove')}>{t('admin.remove')}</Button>}
        {status === 'removed' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => moderate('restore')}>{t('admin.restore')}</Button>}
        <Button size="sm" variant="premium" disabled={busy} onClick={() => call('admin_set_property_access', { p_id: id, p_is_premium: !isPremium, p_early_access_hours: null })}>
          {t(isPremium ? 'admin.makeStandard' : 'admin.makePremium')}
        </Button>
      </div>
    </div>
  )
}

export function ReportResolution({ id }: { id: string }) {
  const { call, busy, t } = useRpc()
  const [note, setNote] = useState('')
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.note')} aria-label={t('admin.note')} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" disabled={busy} onClick={() => call('admin_resolve_report', { p_id: id, p_status: 'resolved', p_note: note || null, p_remove_property: true })}>{t('admin.removeListing')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => call('admin_resolve_report', { p_id: id, p_status: 'resolved', p_note: note || null, p_remove_property: false })}>{t('admin.resolve')}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => call('admin_resolve_report', { p_id: id, p_status: 'dismissed', p_note: note || null, p_remove_property: false })}>{t('admin.dismiss')}</Button>
      </div>
    </div>
  )
}

export function UserActions({ id, suspended, isPremium }: { id: string; suspended: boolean; isPremium: boolean }) {
  const { call, busy, t } = useRpc()
  return (
    <div className="flex flex-wrap gap-2">
      {isPremium ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => call('admin_set_membership', { p_user: id, p_months: 0 })}>{t('admin.revokePremium')}</Button>
      ) : (
        <Button size="sm" variant="premium" disabled={busy} onClick={() => call('admin_set_membership', { p_user: id, p_months: 1 })}>{t('admin.grantPremium')}</Button>
      )}
      <Button size="sm" variant={suspended ? 'secondary' : 'danger'} disabled={busy} onClick={() => call('admin_set_user_suspended', { p_user: id, p_suspended: !suspended })}>
        {t(suspended ? 'admin.reinstate' : 'admin.suspend')}
      </Button>
    </div>
  )
}

export function FoundingToggle({ id, founding }: { id: string; founding: boolean }) {
  const { call, busy, t } = useRpc()
  return (
    <Button size="sm" variant={founding ? 'secondary' : 'ghost'} disabled={busy} onClick={() => call('admin_set_founding', { p_provider_id: id, p_founding: !founding })}>
      🏅 {t(founding ? 'founding.remove' : 'founding.make')}
    </Button>
  )
}

export function PartnerForm() {
  const { call, busy, t } = useRpc()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const valid = /^[A-Z0-9-]{3,20}$/.test(code) && name.trim().length >= 2
  return (
    <form className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]" onSubmit={async (e) => {
      e.preventDefault()
      await call('admin_save_partner', { p_code: code, p_name: name, p_contact: contact || null, p_active: true })
      setCode(''); setName(''); setContact('')
    }}>
      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="HRE-TINO" aria-label={t('partners.code')} maxLength={20} />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('partners.name')} aria-label={t('partners.name')} />
      <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('partners.contact')} aria-label={t('partners.contact')} />
      <Button type="submit" disabled={busy || !valid}>{t('partners.save')}</Button>
    </form>
  )
}
