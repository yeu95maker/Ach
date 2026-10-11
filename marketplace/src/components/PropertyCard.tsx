'use client'
import clsx from 'clsx'
import { Bath, BadgeCheck, BedDouble, Car, Clock, Lock, MapPin, Ruler, Trees } from 'lucide-react'
import Link from 'next/link'
import { formatArea, formatPrice, hoursUntil, primarySize } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { imageUrl } from '@/lib/images'
import type { PropertyCard as Card } from '@/lib/types'
import { CategoryIcon } from './CategoryIcon'
import { SaveButton } from './SaveButton'

export function PropertyCard({ property: p, compact = false }: { property: Card; compact?: boolean }) {
  const { t, locale } = useI18n()
  const size = primarySize(p)
  const cover = imageUrl(p.cover_image)
  const early = p.early_access_until && hoursUntil(p.early_access_until) > 0
  const title = p.locked ? t('locked.title') : `${t(`category.${p.category}`)} – ${p.area}`

  return (
    <article className={clsx('group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/70', compact && 'flex')}>
      <Link href={`/properties/${p.id}`} className={clsx('block', compact && 'flex w-full')}>
        <div className={clsx('relative bg-gray-100', compact ? 'w-32 shrink-0' : 'aspect-[4/3]')}>
          {cover ? (
            <img src={cover} alt="" loading="lazy" className={clsx('h-full w-full object-cover', p.locked && 'blur-[2px]')} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300"><CategoryIcon category={p.category} className="size-12" /></div>
          )}
          {!compact && (
            <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
              {p.is_premium && <span className="rounded-full bg-gray-900/85 px-2 py-0.5 text-xs font-bold text-gold-100">🔒 {t('premium.membersOnly')}</span>}
              {early && <span className="inline-flex items-center gap-1 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-white"><Clock className="size-3" />{t('premium.earlyAccess')}</span>}
            </div>
          )}
        </div>
        <div className={clsx('p-3.5', compact && 'min-w-0 flex-1 py-2.5')}>
          <p className="truncate text-[15px] font-semibold text-gray-900">{p.locked ? title : p.title}</p>
          {!p.locked && <p className="truncate text-xs text-gray-500">{title}</p>}
          <p className={clsx('mt-1 text-xl font-extrabold tracking-tight', p.locked ? 'text-gray-400' : 'text-gray-900')}>
            {p.price !== null ? formatPrice(p.price, p.currency, locale) : <span className="inline-flex items-center gap-1 text-base"><Lock className="size-4" /> {t('locked.price')}</span>}
          </p>
          <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            {p.bedrooms !== null && <li className="inline-flex items-center gap-1"><BedDouble className="size-4" />{t('card.bedrooms', { n: p.bedrooms })}</li>}
            {p.bathrooms !== null && !compact && <li className="inline-flex items-center gap-1"><Bath className="size-4" />{p.bathrooms}</li>}
            {size !== null && <li className="inline-flex items-center gap-1"><Ruler className="size-4" />{formatArea(size, locale)}</li>}
            {!compact && p.features.includes('garage') && <li className="inline-flex items-center gap-1"><Car className="size-4" />{t('feature.garage')}</li>}
            {!compact && p.features.includes('garden') && <li className="inline-flex items-center gap-1"><Trees className="size-4" />{t('feature.garden')}</li>}
          </ul>
          <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-gray-500"><MapPin className="size-4" />{p.area}, {p.city}</p>
          {!compact && (
            <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2.5">
              {p.locked ? (
                <span className="text-sm font-bold text-gold-700">{t('premium.unlock')} →</span>
              ) : p.provider?.verified ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><BadgeCheck className="size-4" />{t('provider.verified')}</span>
              ) : <span />}
              <span className="text-sm font-semibold text-brand-700">{t('card.view')}</span>
            </div>
          )}
        </div>
      </Link>
      <div className={clsx('absolute', compact ? 'right-2 bottom-2' : 'top-2.5 right-2.5')}>
        <SaveButton propertyId={p.id} initial={p.is_favorite} />
      </div>
    </article>
  )
}
