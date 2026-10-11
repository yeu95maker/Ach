'use client'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { toast } from './Toaster'
import { Button, Field, Input, Select } from './ui'

export function ProfileForm({ userId, fullName }: { userId: string; fullName: string }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [name, setName] = useState(fullName)
  const [lang, setLang] = useState<Locale>(locale)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabaseBrowser().from('profiles').update({ full_name: name, locale: lang }).eq('id', userId)
    document.cookie = `${LOCALE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
    toast(error ? { text: t('error.generic'), tone: 'error' } : { text: t('common.saved'), tone: 'success' })
    router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label={t('auth.name')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
      <Field label={t('profile.language')}>
        <Select value={lang} onChange={(e) => setLang(e.target.value as Locale)}>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </Select>
      </Field>
      <Button type="submit">{t('common.save')}</Button>
    </form>
  )
}

export function SignOutButton() {
  const { t } = useI18n()
  const router = useRouter()
  return (
    <Button variant="secondary" block onClick={async () => {
      await supabaseBrowser().auth.signOut()
      router.push('/')
      router.refresh()
    }}>
      <LogOut className="size-4" /> {t('auth.signOut')}
    </Button>
  )
}

export function MarkAllRead() {
  const { t } = useI18n()
  const router = useRouter()
  return (
    <Button variant="ghost" size="sm" onClick={async () => {
      await supabaseBrowser().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      router.refresh()
    }}>{t('notifications.markAllRead')}</Button>
  )
}
