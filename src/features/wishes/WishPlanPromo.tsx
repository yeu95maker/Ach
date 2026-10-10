import { ArrowRight, CalendarHeart, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { isoDateInTimeZone } from '@/domain/dates'
import { can } from '@/domain/permissions'
import { daysUntil } from '@/domain/wishes'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { useHospitalFormatter } from '@/features/tenant/useHospitalFormatter'
import { cn } from '@/ui'
import { useMySubmission, useWishPeriods } from './useWishes'

/** Dashboard card while a Wunschplan of one's own ward is open. */
export function WishPlanPromo() {
  const employment = useEmployment()
  const allowed = can(employment, 'wishes.submit')
  return allowed ? <Promo /> : null
}

function Promo() {
  const { t } = useTranslation()
  const employment = useEmployment()
  const fmt = useHospitalFormatter()
  const periods = useWishPeriods()
  const myUnits = new Set(employment.units.map((u) => u.id))
  const period = (periods.data ?? [])
    .filter((p) => p.status === 'open' && myUnits.has(p.unitId) && p.deadlineAt > new Date())
    .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime())[0]
  const submission = useMySubmission(period?.id ?? null)

  if (!period || submission.isLoading) return null
  const done = !!submission.data
  const days = daysUntil(period.deadlineAt)
  const deadline = fmt.dateShort(isoDateInTimeZone(period.deadlineAt, employment.hospital.timezone))

  return (
    <Link
      to={`/schedule/wishes?period=${period.id}`}
      className={cn(
        'group flex animate-rise items-center gap-4 rounded-[var(--radius-card)] border p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-6',
        done ? 'border-border/70 bg-surface' : 'border-wish-night/25 bg-gradient-to-br from-wish-night-soft to-surface',
      )}
    >
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', done ? 'bg-success-soft text-success' : 'bg-wish-night text-white')}>
        {done ? <CheckCircle2 className="size-6" /> : <CalendarHeart className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold">{t('wishes.promoTitle', { month: fmt.monthYear(period.periodStart) })}</p>
        <p className="text-sm text-text-2">
          {done ? t('wishes.promoDone', { date: deadline }) : days <= 3 ? t('wishes.promoUrgent', { count: days, date: deadline }) : t('wishes.promoOpen', { date: deadline })}
        </p>
      </div>
      <ArrowRight className="size-5 shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
