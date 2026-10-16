'use client'
import { Share2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import { shareLink } from '@/lib/native/client'
import { toast } from './Toaster'

/** Shares a page via the native share sheet (app), Web Share API or clipboard. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const { t } = useI18n()
  return (
    <button type="button"
      onClick={async () => {
        const result = await shareLink({ title, url: `${window.location.origin}${path}` })
        if (result === 'copied') toast({ text: t('share.copied'), tone: 'success' })
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-700">
      <Share2 className="size-4" /> {t('share.action')}
    </button>
  )
}
