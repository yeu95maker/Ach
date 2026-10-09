import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authRepository } from '@/data/authRepository'
import { PASSWORD_MIN_LENGTH, passwordIssues } from '@/features/auth/passwordPolicy'
import { Button, Field, Input, Sheet, useToast } from '@/ui'

export function ChangePasswordSheet({ email, open, onClose }: { email: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  const submit = async () => {
    setError(null)
    if (passwordIssues(next).length) return setError(t('auth.passwordPolicy', { min: PASSWORD_MIN_LENGTH }))
    if (next !== confirm) return setError(t('auth.passwordMismatch'))
    setBusy(true)
    try {
      await authRepository.verifyPassword(email, current)
    } catch {
      setBusy(false)
      return setError(t('profile.currentPasswordWrong'))
    }
    try {
      await authRepository.updatePassword(next)
      toast.show({ tone: 'success', title: t('auth.passwordUpdated') })
      reset()
      onClose()
    } catch {
      setError(t('errors.validation'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      closeLabel={t('common.close')}
      title={t('profile.changePassword')}
      description={t('auth.passwordPolicy', { min: PASSWORD_MIN_LENGTH })}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={!current || !next || !confirm} onClick={submit}>
          {t('auth.savePassword')}
        </Button>
      }
    >
      <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <input type="text" autoComplete="username" value={email} readOnly hidden />
        <Field label={t('profile.currentPassword')} htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('auth.newPassword')} htmlFor="pw-new">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('auth.confirmPassword')} htmlFor="pw-confirm" error={error}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
