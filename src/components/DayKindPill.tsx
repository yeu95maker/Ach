import { useTranslation } from 'react-i18next'
import type { DayKind } from '@/domain/types'
import { cn } from '@/ui'
import { dayKindStyles } from './dayKindStyles'

export function DayKindPill({ kind, label, className }: { kind: DayKind; label?: string; className?: string }) {
  const { t } = useTranslation()
  const s = dayKindStyles[kind]
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold', s.soft, s.text, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {label ?? t(`dayKind.${kind}`)}
    </span>
  )
}

export function Legend({ kinds, className }: { kinds: readonly DayKind[]; className?: string }) {
  const { t } = useTranslation()
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-2', className)} aria-label={t('schedule.legend')}>
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-2 text-[13px] text-text-2">
          <span className={cn('size-2.5 rounded-full', dayKindStyles[k].dot)} aria-hidden />
          {t(`dayKind.${k}`)}
        </li>
      ))}
    </ul>
  )
}
