'use client'
import { Copy } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import { toast } from './Toaster'

/** Partner link with a copy button (falls back to the current origin when APP_URL is unset). */
export function CopyLink({ url }: { url: string }) {
  const { t } = useI18n()
  const full = () => (url.startsWith('/') ? `${window.location.origin}${url}` : url)
  return (
    <button type="button" onClick={async () => {
      await navigator.clipboard?.writeText(full()).catch(() => {})
      toast({ text: t('partners.copied'), tone: 'success' })
    }} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-brand-200">
      <Copy className="size-4 shrink-0" /><span className="truncate">{url}</span>
    </button>
  )
}
