import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { Button, EmptyState } from '@/ui'

/** Uniform error presentation for failed queries, with retry. */
export function QueryError({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <EmptyState
      compact={compact}
      icon={<AlertCircle />}
      title={t('errors.title')}
      description={t(errorMessageKey(error))}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  )
}

export function Stagger({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      {children}
    </div>
  )
}
