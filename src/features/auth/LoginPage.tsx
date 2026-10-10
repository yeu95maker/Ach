import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation } from 'react-router'
import { config } from '@/core/config'
import { authRepository, type OAuthProvider } from '@/data/authRepository'
import { isNative } from '@/native/platform'
import { Button, Field, Input, cn } from '@/ui'
import { AuthLayout } from './AuthLayout'
import { useSession } from './SessionProvider'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.2 3.3v2.75h3.55c2.08-1.92 3.25-4.74 3.25-8.08Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.75c-.99.66-2.25 1.06-3.73 1.06-2.87 0-5.3-1.94-6.16-4.54H2.17v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.17a11 11 0 0 0 0 9.88l3.67-2.84Z" />
      <path fill="#EA4335" d="M12 5.36c1.62 0 3.07.56 4.21 1.65l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.17 7.06l3.67 2.84C6.7 7.3 9.13 5.36 12 5.36Z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const { session } = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState<'password' | OAuthProvider | null>(null)
  // Set by the native deep-link handler when an e-mail or OAuth link could not be used.
  const [error, setError] = useState<string | null>(() => ((location.state as { authError?: string } | null)?.authError ? t('auth.linkFailed') : null))

  const providers = config?.oauthProviders ?? []

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy('password')
    try {
      await authRepository.signInWithPassword(email, password)
    } catch {
      setError(t('auth.invalidCredentials'))
    } finally {
      setBusy(null)
    }
  }

  const oauth = async (provider: OAuthProvider) => {
    setError(null)
    setBusy(provider)
    try {
      await authRepository.signInWithOAuth(provider) // web: redirects; native: opens the system browser
      if (isNative()) setBusy(null)
    } catch {
      setError(t('errors.unknown'))
      setBusy(null)
    }
  }

  return (
    <AuthLayout title={t('auth.welcome')} subtitle={t('auth.welcomeSubtitle')}>
      {providers.length > 0 && (
        <>
          <div className="grid gap-3">
            {providers.includes('azure') && (
              <Button variant="secondary" size="lg" fullWidth icon={<MicrosoftIcon />} loading={busy === 'azure'} disabled={!!busy} onClick={() => oauth('azure')}>
                {t('auth.continueWithMicrosoft')}
              </Button>
            )}
            {providers.includes('google') && (
              <Button variant="secondary" size="lg" fullWidth icon={<GoogleIcon />} loading={busy === 'google'} disabled={!!busy} onClick={() => oauth('google')}>
                {t('auth.continueWithGoogle')}
              </Button>
            )}
          </div>

          <div className="my-7 flex items-center gap-4 text-[13px] text-text-3">
            <span className="h-px flex-1 bg-border" />
            {t('auth.orWithEmail')}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@klinikum.de"
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-text-3 hover:text-text"
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>

        <div className={cn('rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-text', !error && 'hidden')} role="alert">
          {error}
        </div>

        <Button type="submit" size="lg" fullWidth loading={busy === 'password'} disabled={!email || !password || !!busy}>
          {t('auth.signIn')}
        </Button>
        <p className="text-center">
          <Link to="/forgot-password" className="text-sm font-medium text-primary-text hover:underline">
            {t('auth.forgotPassword')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
