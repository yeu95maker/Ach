'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { errorKey } from '@/lib/errors'
import { useI18n } from '@/lib/i18n/client'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Alert, Button, Field, Input } from './ui'

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next: string }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = supabaseBrowser()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) return setError(t(errorKey(error)))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, locale },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      })
      setBusy(false)
      if (error) return setError(t(errorKey(error)))
      if (!data.session) return setCheckEmail(true)
    }
    router.push(next)
    router.refresh()
  }

  if (checkEmail) return <Alert tone="success">{t('auth.checkEmail', { email })}</Alert>

  const other = mode === 'login' ? '/signup' : '/login'
  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'signup' && (
        <Field label={t('auth.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" />
        </Field>
      )}
      <Field label={t('auth.email')}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Field>
      <Field label={t('auth.password')} hint={mode === 'signup' ? t('auth.passwordHint') : undefined}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" block size="lg" disabled={busy}>{t(mode === 'login' ? 'auth.signIn' : 'auth.createAccount')}</Button>
      <p className="text-center text-sm text-gray-600">
        {t(mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
        <Link href={`${other}?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700">{t(mode === 'login' ? 'auth.signUp' : 'auth.signIn')}</Link>
      </p>
      {mode === 'signup' && <p className="text-center text-xs text-gray-500">{t('auth.freeNote')}</p>}
    </form>
  )
}
