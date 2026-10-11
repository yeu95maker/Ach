'use client'
import clsx from 'clsx'
import { Lock } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { featuresFor, hasRooms, type Filters } from '@/lib/filters'
import { useI18n } from '@/lib/i18n/client'
import { CATEGORIES, type Feature } from '@/lib/types'
import { Sheet } from './Sheet'
import { Button, Field, Input } from './ui'

const ROOM_OPTIONS = [undefined, 1, 2, 3, 4, 5] as const
const AGE_OPTIONS = [undefined, 1, 7, 30] as const

function Chips<T extends string | number | undefined>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={clsx('h-9 rounded-full px-3.5 text-sm font-semibold ring-1', value === o ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-700 ring-gray-300')}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)))

export function FilterSheet({ open, onClose, filters, isPremium, onApply }: { open: boolean; onClose: () => void; filters: Filters; isPremium: boolean; onApply: (f: Filters) => void }) {
  const { t } = useI18n()
  const [f, setF] = useState<Filters>(filters)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((prev) => ({ ...prev, [k]: v }))
  const toggleFeature = (feature: Feature) =>
    set('features', f.features?.includes(feature) ? f.features.filter((x) => x !== feature) : [...(f.features ?? []), feature])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('filters.title')}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-3 pb-1">
          <Button variant="ghost" onClick={() => setF({ country: f.country, city: f.city, area: f.area, sort: f.sort })}>{t('filters.reset')}</Button>
          <Button onClick={() => onApply(f)}>{t('filters.apply')}</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.type')}</h3>
          <Chips value={f.category} options={[undefined, ...CATEGORIES]} onChange={(v) => set('category', v)} label={(v) => (v ? t(`categoryPlural.${v}`) : t('filters.any'))} />
        </section>

        <section className="grid grid-cols-3 gap-2.5">
          <Field label={t('filters.country')}><Input value={f.country ?? ''} onChange={(e) => set('country', e.target.value || undefined)} /></Field>
          <Field label={t('filters.city')}><Input value={f.city ?? ''} onChange={(e) => set('city', e.target.value || undefined)} /></Field>
          <Field label={t('filters.area')}><Input value={f.area ?? ''} onChange={(e) => set('area', e.target.value || undefined)} /></Field>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.price')}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <Input type="number" inputMode="numeric" min={0} step={1000} placeholder={t('filters.min')} aria-label={t('filters.minPrice')} value={f.min_price ?? ''} onChange={(e) => set('min_price', num(e.target.value))} />
            <Input type="number" inputMode="numeric" min={0} step={1000} placeholder={t('filters.max')} aria-label={t('filters.maxPrice')} value={f.max_price ?? ''} onChange={(e) => set('max_price', num(e.target.value))} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.size')}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <Input type="number" inputMode="numeric" min={0} step={50} placeholder={t('filters.minM2')} aria-label={t('filters.minSize')} value={f.min_size ?? ''} onChange={(e) => set('min_size', num(e.target.value))} />
            <Input type="number" inputMode="numeric" min={0} step={50} placeholder={t('filters.maxM2')} aria-label={t('filters.maxSize')} value={f.max_size ?? ''} onChange={(e) => set('max_size', num(e.target.value))} />
          </div>
        </section>

        {hasRooms(f.category) && (
          <>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.bedrooms')}</h3>
              <Chips value={f.min_bedrooms} options={ROOM_OPTIONS} onChange={(v) => set('min_bedrooms', v)} label={(v) => (v ? `${v}+` : t('filters.any'))} />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.bathrooms')}</h3>
              <Chips value={f.min_bathrooms} options={ROOM_OPTIONS.slice(0, 5)} onChange={(v) => set('min_bathrooms', v)} label={(v) => (v ? `${v}+` : t('filters.any'))} />
            </section>
          </>
        )}

        <section className={clsx('rounded-2xl p-4 ring-1', isPremium ? 'ring-gray-200' : 'bg-gold-100/50 ring-gold-500/30')}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">{t('filters.advanced')}</h3>
            {!isPremium && (
              <Link href="/membership" className="inline-flex items-center gap-1 text-sm font-bold text-gold-700">
                <Lock className="size-4" /> {t('premium.name')}
              </Link>
            )}
          </div>
          <fieldset disabled={!isPremium} className="space-y-5 disabled:opacity-60">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.features')}</h4>
              <div className="flex flex-wrap gap-2">
                {featuresFor(f.category).map((feature) => (
                  <button
                    key={feature}
                    type="button"
                    aria-pressed={!!f.features?.includes(feature)}
                    onClick={() => toggleFeature(feature)}
                    className={clsx('h-9 rounded-full px-3.5 text-sm font-semibold ring-1', f.features?.includes(feature) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-700 ring-gray-300')}
                  >
                    {t(`feature.${feature}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {f.category !== 'land' && (
                <Field label={t('filters.minLivingArea')}>
                  <Input type="number" inputMode="numeric" min={0} value={f.min_living_area ?? ''} onChange={(e) => set('min_living_area', num(e.target.value))} />
                </Field>
              )}
              {f.category !== 'land' && (
                <Field label={t('filters.minParking')}>
                  <Input type="number" inputMode="numeric" min={0} value={f.min_parking ?? ''} onChange={(e) => set('min_parking', num(e.target.value))} />
                </Field>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">{t('filters.listedWithin')}</h4>
              <Chips value={f.max_age_days} options={AGE_OPTIONS} onChange={(v) => set('max_age_days', v)} label={(v) => (v ? t('filters.days', { n: v }) : t('filters.any'))} />
            </div>
          </fieldset>
        </section>
      </div>
    </Sheet>
  )
}
