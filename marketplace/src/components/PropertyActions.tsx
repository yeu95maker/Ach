'use client'
import { Flag, MessageCircle } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { REPORT_REASONS, type ReportReason } from '@/lib/types'
import { viewerKey } from '@/lib/viewer'
import { Sheet } from './Sheet'
import { toast } from './Toaster'
import { Alert, Button, Field, Textarea } from './ui'

/** Counts the view once per viewer and day (owners are ignored by the database). */
export function ViewTracker({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    void supabaseBrowser().rpc('record_property_view', { p_id: propertyId, p_viewer_key: viewerKey() })
  }, [propertyId])
  return null
}

async function requireSession(router: ReturnType<typeof useRouter>, next: string) {
  const { data: { session } } = await supabaseBrowser().auth.getSession()
  if (!session) router.push(`/login?next=${encodeURIComponent(next)}`)
  return session
}

/** "Message provider": opens a composer; the conversation is created with the first message. */
export function MessageProviderButton({ propertyId, conversationId, block }: { propertyId: string; conversationId: string | null; block?: boolean }) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quick = [t('message.quick.available'), t('message.quick.viewing'), t('message.quick.documents')]

  async function start() {
    if (conversationId) return router.push(`/messages/${conversationId}`)
    if (!(await requireSession(router, pathname))) return
    setText(quick[0])
    setOpen(true)
  }

  async function send() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabaseBrowser().rpc('start_conversation', { p_property_id: propertyId, p_message: text })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    router.push(`/messages/${data}`)
  }

  return (
    <>
      <Button onClick={start} block={block} size="lg">
        <MessageCircle className="size-5" /> {t(conversationId ? 'message.open' : 'message.provider')}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('message.provider')}
        footer={<Button block onClick={send} disabled={busy || !text.trim()} className="mb-1">{t('message.send')}</Button>}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button key={q} type="button" onClick={() => setText(q)} className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-brand-200">{q}</button>
            ))}
          </div>
          <Field label={t('message.yourMessage')}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={4} />
          </Field>
          <p className="text-xs text-gray-500">{t('message.inAppOnly')}</p>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Sheet>
    </>
  )
}

export function ReportButton({ propertyId }: { propertyId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('scam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const session = await requireSession(router, pathname)
    if (!session) return
    setBusy(true)
    const { error } = await supabaseBrowser().from('reports').insert({ property_id: propertyId, reporter_id: session.user.id, reason, details })
    setBusy(false)
    if (error) return toast({ text: t(errorKey(error)), tone: 'error' })
    setOpen(false)
    toast({ text: t('report.thanks'), tone: 'success' })
  }

  return (
    <>
      <button type="button" onClick={async () => (await requireSession(router, pathname)) && setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-700">
        <Flag className="size-4" /> {t('report.title')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('report.title')}
        footer={<Button variant="danger" block onClick={submit} disabled={busy} className="mb-1">{t('report.submit')}</Button>}>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-gray-600">{t('report.why')}</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-gray-200 has-checked:bg-red-50 has-checked:ring-red-300">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-red-600" />
              <span className="text-[15px]">{t(`report.reason.${r}`)}</span>
            </label>
          ))}
        </fieldset>
        <Field label={t('report.details')} className="mt-4">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={3} />
        </Field>
      </Sheet>
    </>
  )
}
