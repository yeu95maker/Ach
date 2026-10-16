import { Building2, Compass, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { authRepository } from '@/data/authRepository'
import { Button, ButtonLink, EmptyState, Spinner } from '@/ui'
import { LogoMark } from './layout/Logo'

export function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <LogoMark className="size-14 animate-scale-in" />
      <Spinner className="text-text-3" />
    </div>
  )
}

/** Shown when the build is missing Supabase configuration (developer error). */
export function ConfigErrorScreen({ missing }: { missing: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <Settings2 className="mx-auto mb-4 size-10 text-warning" />
        <h1 className="text-2xl font-bold">Dienstwerk is not configured</h1>
        <p className="mt-2 text-text-2">
          Missing or invalid environment variables: <code className="rounded bg-surface-2 px-1.5 py-0.5">{missing}</code>. Copy{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.example</code> to <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local</code>.
        </p>
      </div>
    </div>
  )
}

export function NoEmploymentScreen() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<Building2 />}
        title={t('tenant.noEmploymentTitle')}
        description={t('tenant.noEmploymentText')}
        action={
          <Button variant="secondary" onClick={() => void authRepository.signOut('local')}>
            {t('profile.signOut')}
          </Button>
        }
      />
    </div>
  )
}

export function ContextErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<Settings2 />}
        title={t('errors.title')}
        description={t(errorMessageKey(error))}
        action={
          <div className="flex gap-3">
            <Button onClick={onRetry}>{t('common.retry')}</Button>
            <Button variant="secondary" onClick={() => void authRepository.signOut('local')}>
              {t('profile.signOut')}
            </Button>
          </div>
        }
      />
    </div>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={<Compass />}
      title={t('errors.notFoundTitle')}
      description={t('errors.notFoundText')}
      action={<ButtonLink to="/">{t('common.backToHome')}</ButtonLink>}
    />
  )
}
