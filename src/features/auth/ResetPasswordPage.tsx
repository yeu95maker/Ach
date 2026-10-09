import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { authRepository } from '@/data/authRepository'
import { Button, Field, Input, useToast } from '@/ui'
import { AuthLayout } from './AuthLayout'
import { PASSWORD_MIN_LENGTH, passwordIssues } from './passwordPolicy'
import { useSession } from './SessionProvider'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { session, loading, clearRecovery } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && !session) return <Navigate to="/forgot-password" replace />

  const issues = passwordIssues(password)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (issues.length) return setError(t('auth.passwordPolicy', { min: PASSWORD_MIN_LENGTH }))
    if (password !== confirm) return setError(t('auth.passwordMismatch'))
    setBusy(true)
    setError(null)
    try {
      await authRepository.updatePassword(password)
      clearRecovery()
      toast.show({ tone: 'success', title: t('auth.passwordUpdated') })
      navigate('/', { replace: true })
    } catch {
      setError(t('errors.validation'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t('auth.newPasswordTitle')} subtitle={t('auth.passwordPolicy', { min: PASSWORD_MIN_LENGTH })}>
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label={t('auth.newPassword')} htmlFor="new-password">
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.confirmPassword')} htmlFor="confirm-password" error={error}>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!password || !confirm}>
          {t('auth.savePassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
