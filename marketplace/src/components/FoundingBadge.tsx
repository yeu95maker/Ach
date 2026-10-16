'use client'
import { Award } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

/** Shown for the providers who joined StandFinder at launch. */
export function FoundingBadge({ size = 'sm', compact = false }: { size?: 'sm' | 'md'; compact?: boolean }) {
  const { t } = useI18n()
  if (compact) {
    return (
      <span title={t('founding.badge')} aria-label={t('founding.badge')} className="inline-flex size-6 items-center justify-center rounded-full bg-gold-100 text-gold-700">
        <Award className="size-3.5" />
      </span>
    )
  }
  return (
    <span title={t('founding.meaning')}
      className={`inline-flex items-center gap-1 rounded-full bg-gold-100 font-semibold text-gold-700 ${size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      <Award className={size === 'md' ? 'size-4' : 'size-3.5'} />{t('founding.badge')}
    </span>
  )
}
