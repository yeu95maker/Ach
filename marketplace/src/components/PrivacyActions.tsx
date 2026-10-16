'use client'
import { Download, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'
import { Button, Field, Input } from './ui'

/** GDPR self-service: download everything we store, or delete the account. */
export function PrivacyActions() {
  const { t } = useI18n()
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  async function download() {
    const { data, error } = await supabaseBrowser().rpc('my_data_export')
    if (error || !data) return toast({ text: t('error.generic'), tone: 'error' })
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `standfinder-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function remove() {
    setDeleting(true)
    const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm }) })
    setDeleting(false)
    if (!res.ok) return toast({ text: t('error.generic'), tone: 'error' })
    await supabaseBrowser().auth.signOut().catch(() => {})
    toast({ text: t('privacy.deleted'), tone: 'success' })
    router.push('/')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t('privacy.text')}</p>
      <Button variant="secondary" onClick={download}><Download className="size-4" />{t('privacy.download')}</Button>
      {!showDelete ? (
        <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setShowDelete(true)}><Trash2 className="size-4" />{t('privacy.delete')}</Button>
      ) : (
        <div className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="text-sm text-red-900">{t('privacy.deleteWarning')}</p>
          <Field label={t('privacy.typeDelete')}><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
          <Button variant="danger" disabled={confirm !== 'DELETE' || deleting} onClick={remove}>{t('privacy.deleteForever')}</Button>
        </div>
      )}
    </div>
  )
}
