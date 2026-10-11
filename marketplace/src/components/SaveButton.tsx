'use client'
import clsx from 'clsx'
import { Heart } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'

export function SaveButton({ propertyId, initial, variant = 'icon' }: { propertyId: string; initial: boolean; variant?: 'icon' | 'button' }) {
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useI18n()

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const supabase = supabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    setBusy(true)
    const next = !saved
    setSaved(next)
    const { error } = next
      ? await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      : await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
    setBusy(false)
    if (error) {
      setSaved(!next)
      const key = errorKey(error)
      toast(key === 'error.favoritesLimit'
        ? { text: t(key), tone: 'error', action: { label: t('premium.upgrade'), href: '/membership' } }
        : { text: t(key), tone: 'error' })
      return
    }
    toast({ text: t(next ? 'save.added' : 'save.removed'), tone: 'success' })
    router.refresh()
  }

  const label = t(saved ? 'save.unsave' : 'save.save')
  if (variant === 'button') {
    return (
      <button type="button" onClick={toggle} aria-pressed={saved} className={clsx('inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold ring-1', saved ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-white text-gray-900 ring-gray-300')}>
        <Heart className={clsx('size-5', saved && 'fill-red-600 text-red-600')} />
        {label}
      </button>
    )
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={label} title={label}
      className="flex size-10 items-center justify-center rounded-full bg-white/95 shadow ring-1 ring-black/5 transition hover:scale-105">
      <Heart className={clsx('size-5', saved ? 'fill-red-600 text-red-600' : 'text-gray-700')} />
    </button>
  )
}
