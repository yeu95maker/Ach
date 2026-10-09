import { MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { authRepository } from '@/data/authRepository'
import { Button, ButtonLink, Field, Input } from '@/ui'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await authRepository.requestPasswordReset(email)
    } catch {
      /* Do not reveal whether an account exists. */
    } finally {
      setBusy(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <AuthLayout title={t('auth.resetSentTitle')} subtitle={t('auth.resetSentText', { email })}>
        <div className="mb-8 flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
          <MailCheck className="size-8" />
        </div>
        <ButtonLink to="/login" variant="secondary" size="lg" fullWidth>
          {t('auth.backToLogin')}
        </ButtonLink>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!email}>
          {t('auth.sendResetLink')}
        </Button>
        <ButtonLink to="/login" variant="ghost" size="lg" fullWidth>
          {t('auth.backToLogin')}
        </ButtonLink>
      </form>
    </AuthLayout>
  )
}
