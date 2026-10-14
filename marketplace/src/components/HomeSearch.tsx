'use client'
import clsx from 'clsx'
import { MapPin, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { filtersToQuery, type Filters } from '@/lib/filters'
import { useI18n } from '@/lib/i18n/client'
import { DEFAULT_COUNTRY, parseWhere } from '@/lib/locations'
import { CATEGORIES, TRANSACTIONS, type Category, type Transaction } from '@/lib/types'
import { CATEGORY_EMOJI } from './CategoryIcon'
import { Button, Field, inputClass } from './ui'

/** "What are you looking for? → Where? → Price → SEARCH" */
export function HomeSearch({ suggestions }: { suggestions: string[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [transaction, setTransaction] = useState<Transaction>('sale')
  const [category, setCategory] = useState<Category | undefined>()
  const [where, setWhere] = useState('Harare')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  function go(view: 'list' | 'map') {
    const f: Filters = { transaction, category, country: DEFAULT_COUNTRY, ...parseWhere(where) }
    if (minPrice) f.min_price = Number(minPrice)
    if (maxPrice) f.max_price = Number(maxPrice)
    router.push(`/search?${filtersToQuery(f, { view: view === 'map' ? 'map' : undefined })}`)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        go('list')
      }}
      className="space-y-5"
    >
      <div role="group" aria-label={t('filters.transaction')} className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
        {TRANSACTIONS.map((tx) => (
          <button key={tx} type="button" aria-pressed={transaction === tx}
            onClick={() => {
              setTransaction(tx)
              if (tx === 'sale' && category === 'room') setCategory(undefined)
            }}
            className={clsx('h-11 rounded-xl text-base font-bold', transaction === tx ? 'bg-white text-brand-800 shadow-sm' : 'text-gray-600')}>
            {t(`transaction.${tx}`)}
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm font-semibold text-gray-700">{t('home.what')}</legend>
        <div className={clsx('grid grid-cols-2 gap-2.5', transaction === 'rent' ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
          {CATEGORIES.filter((c) => c !== 'room' || transaction === 'rent').map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? undefined : c)}
              className={clsx(
                'flex h-20 flex-col items-center justify-center gap-1 rounded-2xl text-[15px] font-semibold ring-1 transition',
                category === c ? 'bg-brand-600 text-white ring-brand-600 shadow-md' : 'bg-white text-gray-800 ring-gray-200 hover:ring-brand-500',
              )}
            >
              <span className="text-2xl" aria-hidden>{CATEGORY_EMOJI[c]}</span>
              {t(`categoryPlural.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={t('home.where')}>
        <div className="relative">
          <MapPin className="pointer-events-none absolute top-3 left-3 size-5 text-gray-400" />
          <input
            className={clsx(inputClass, 'pl-10')}
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            list="where-suggestions"
            placeholder={t('home.wherePlaceholder')}
            autoComplete="off"
          />
          <datalist id="where-suggestions">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-700">{t(transaction === 'rent' ? 'filters.rentPerMonth' : 'home.price')}</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <input className={inputClass} inputMode="numeric" type="number" min={0} step={transaction === 'rent' ? 50 : 1000} placeholder={t('filters.min')} aria-label={t('filters.minPrice')} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
          <input className={inputClass} inputMode="numeric" type="number" min={0} step={transaction === 'rent' ? 50 : 1000} placeholder={t('filters.max')} aria-label={t('filters.maxPrice')} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
      </fieldset>

      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
        <Button type="submit" size="lg" block>
          <Search className="size-5" /> {t('home.search')}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => go('map')}>
          <MapPin className="size-5" /> {t('home.searchOnMap')}
        </Button>
      </div>
    </form>
  )
}
