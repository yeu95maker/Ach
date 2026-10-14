'use client'
import { formatPrice } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import type { Transaction } from '@/lib/types'

/** "$180,000" for sales, "$650 / month" for rentals. */
export function PriceText({ amount, currency, transaction, suffixClassName = 'text-[0.6em] font-semibold text-gray-500' }: {
  amount: number; currency: string; transaction?: Transaction; suffixClassName?: string
}) {
  const { t, locale } = useI18n()
  return (
    <>
      {formatPrice(amount, currency, locale)}
      {transaction === 'rent' && <span className={suffixClassName}> {t('price.perMonth')}</span>}
    </>
  )
}
