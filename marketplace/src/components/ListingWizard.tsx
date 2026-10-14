'use client'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, MapPin, Plus, Star, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { errorKey } from '@/lib/errors'
import { featuresFor, hasRooms } from '@/lib/filters'
import { formatArea, formatDistance } from '@/lib/format'
import { useI18n } from '@/lib/i18n/client'
import { imageUrl } from '@/lib/images'
import { firstInvalidStep, MAX_IMAGES, resizeImage, toSavePayload, validateStep, WIZARD_STEPS, type ListingDraft } from '@/lib/listing'
import { AREAS, locate } from '@/lib/locations'
import { supabaseBrowser } from '@/lib/supabase/client'
import { CATEGORIES, CONDITIONS, NEARBY_KINDS, TRANSACTIONS, type Feature, type NearbyKind } from '@/lib/types'
import { CATEGORY_EMOJI } from './CategoryIcon'
import { Gallery } from './Gallery'
import { LocationPicker } from './map'
import { PriceText } from './PriceText'
import { PropertyCard } from './PropertyCard'
import { toast } from './Toaster'
import { Alert, Button, Field, Input, inputClass, Textarea } from './ui'

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

export function ListingWizard({ initial, providerId, providerName, verified, isNew }: {
  initial: ListingDraft; providerId: string; providerName: string; verified: boolean; isNew: boolean
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [d, setD] = useState<ListingDraft>(initial)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const step = WIZARD_STEPS[stepIndex]
  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setD((prev) => ({ ...prev, [k]: v }))
  const isActive = d.status === 'active'

  function next() {
    const problem = validateStep(step, d)
    if (problem) return setError(t(problem))
    setError(null)
    if (WIZARD_STEPS[stepIndex + 1] === 'description' && !d.title.trim()) set('title', suggestedTitle)
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
    window.scrollTo({ top: 0 })
  }
  function back() {
    setError(null)
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  const suggestedTitle = d.category && d.area ? t('wizard.suggestedTitle', { category: t(`category.${d.category}`), area: d.area }) : ''

  async function save(submit: boolean) {
    if (submit) {
      const invalid = firstInvalidStep(d)
      if (invalid) {
        setStepIndex(WIZARD_STEPS.indexOf(invalid.step))
        return setError(t(invalid.error))
      }
    }
    setBusy(true)
    setError(null)
    const { error } = await supabaseBrowser().rpc('save_property', toSavePayload(d, submit))
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    toast({ text: t(submit ? (isActive ? 'wizard.updated' : 'wizard.submitted') : 'wizard.draftSaved'), tone: 'success' })
    router.push('/provider')
    router.refresh()
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const list = Array.from(files).slice(0, MAX_IMAGES - d.images.length)
    setUploading(list.length)
    const supabase = supabaseBrowser()
    for (const file of list) {
      try {
        const blob = await resizeImage(file)
        const path = `${providerId}/${d.id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('property-images').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        setD((prev) => ({ ...prev, images: [...prev.images, path] }))
      } catch {
        toast({ text: t('error.upload'), tone: 'error' })
      }
      setUploading((n) => n - 1)
    }
  }
  const move = (i: number, delta: number) => {
    const images = [...d.images]
    const [img] = images.splice(i, 1)
    images.splice(Math.max(0, Math.min(images.length, i + delta)), 0, img)
    set('images', images)
  }

  const center = useMemo(() => locate({ city: d.city, area: d.area }), [d.city, d.area])
  const [geocoding, setGeocoding] = useState(false)
  const [pinVersion, setPinVersion] = useState(0)

  /** Street + area + city → map pin (Mapbox / OpenStreetMap geocoding via our server). */
  async function findOnMap() {
    setGeocoding(true)
    const q = [d.street_address, d.area, d.city, d.country].map((x) => x.trim()).filter(Boolean).join(', ')
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).catch(() => null)
    const data = res?.ok ? ((await res.json()) as { lat?: number; lng?: number }) : null
    setGeocoding(false)
    if (data?.lat === undefined || data.lng === undefined) return toast({ text: t('wizard.notFound'), tone: 'error' })
    setD((prev) => ({ ...prev, latitude: data.lat!, longitude: data.lng! }))
    setPinVersion((v) => v + 1)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <p className="text-sm font-semibold text-brand-700">{t('wizard.stepOf', { n: stepIndex + 1, total: WIZARD_STEPS.length })}</p>
        <h1 className="text-2xl font-extrabold text-gray-900">{t(`wizard.step.${step}`)}</h1>
        <div className="mt-3 flex gap-1" aria-hidden>
          {WIZARD_STEPS.map((s, i) => (
            <button key={s} type="button" tabIndex={-1} onClick={() => i < stepIndex && setStepIndex(i)}
              className={clsx('h-1.5 flex-1 rounded-full', i <= stepIndex ? 'bg-brand-600' : 'bg-gray-200')} />
          ))}
        </div>
      </div>

      {!verified && <Alert tone="warning" className="mb-4">{t('wizard.notVerified')}</Alert>}

      <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-200/70">
        {step === 'category' && (
          <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-700">{t('wizard.transaction')}</legend>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
              {TRANSACTIONS.map((tx) => (
                <button key={tx} type="button" aria-pressed={d.transaction === tx} onClick={() => setD((prev) => ({ ...prev, transaction: tx, category: tx === 'sale' && prev.category === 'room' ? null : prev.category }))}
                  className={clsx('h-11 rounded-xl text-[15px] font-bold', d.transaction === tx ? 'bg-white text-brand-800 shadow-sm' : 'text-gray-600')}>
                  {t(tx === 'sale' ? 'transaction.forSale' : 'transaction.forRent')}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.filter((c) => c !== 'room' || d.transaction === 'rent').map((c) => (
              <button key={c} type="button" aria-pressed={d.category === c} onClick={() => set('category', c)}
                className={clsx('flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl text-base font-bold ring-2',
                  d.category === c ? 'bg-brand-50 text-brand-800 ring-brand-600' : 'bg-white text-gray-800 ring-gray-200')}>
                <span className="text-3xl" aria-hidden>{CATEGORY_EMOJI[c]}</span>{t(`category.${c}`)}
              </button>
            ))}
          </div>
          </div>
        )}

        {step === 'location' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('filters.country')}><Input value={d.country} onChange={(e) => set('country', e.target.value)} /></Field>
              <Field label={t('filters.city')}><Input value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
            </div>
            <Field label={t('wizard.street')} hint={t('wizard.streetHint')}>
              <div className="flex gap-2">
                <Input value={d.street_address} onChange={(e) => set('street_address', e.target.value)} maxLength={200} placeholder="12 King George Rd" autoComplete="street-address" />
                <Button variant="secondary" onClick={findOnMap} disabled={geocoding || (!d.street_address.trim() && !d.area.trim())} className="shrink-0">
                  {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}{t('wizard.findOnMap')}
                </Button>
              </div>
            </Field>
            <Field label={t('filters.area')}>
              <Input value={d.area} onChange={(e) => set('area', e.target.value)} list="wizard-areas" placeholder="Borrowdale" />
              <datalist id="wizard-areas">{AREAS.filter((a) => a.city.toLowerCase() === d.city.trim().toLowerCase()).map((a) => <option key={a.area} value={a.area} />)}</datalist>
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700">{t('wizard.mapPosition')}</p>
              <LocationPicker value={d.latitude !== null && d.longitude !== null ? { lat: d.latitude, lng: d.longitude } : null}
                key={pinVersion}
                center={{ lat: center.lat, lng: center.lng, zoom: center.zoom }}
                onChange={(pos) => setD((prev) => ({ ...prev, latitude: pos.lat, longitude: pos.lng }))} />
              <p className="mt-1.5 text-xs text-gray-500">{d.latitude !== null ? `${d.latitude.toFixed(5)}, ${d.longitude?.toFixed(5)}` : t('wizard.tapMap')}</p>
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
              <input type="checkbox" checked={d.show_exact_location} onChange={(e) => set('show_exact_location', e.target.checked)} className="mt-0.5 size-5 accent-brand-600" />
              <span><span className="block font-semibold text-gray-900">{t('wizard.showExact')}</span><span className="text-sm text-gray-600">{t('wizard.showExactHint')}</span></span>
            </label>
          </div>
        )}

        {step === 'price' && (
          <div className="space-y-4">
            <Field label={t(d.transaction === 'rent' ? 'wizard.monthlyRent' : 'wizard.priceUsd')} hint={t(d.transaction === 'rent' ? 'wizard.rentHint' : 'wizard.priceHint')}>
              <div className="relative">
                <span className="pointer-events-none absolute top-2.5 left-3 text-gray-500">$</span>
                <input className={clsx(inputClass, 'pl-7 text-lg font-bold')} type="number" inputMode="numeric" min={1} step={d.transaction === 'rent' ? 10 : 500}
                  value={d.price ?? ''} onChange={(e) => set('price', numOrNull(e.target.value))} autoFocus />
              </div>
            </Field>
            {d.transaction === 'rent' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('wizard.additionalCosts')}><Input type="number" inputMode="numeric" min={0} value={d.additional_costs ?? ''} onChange={(e) => set('additional_costs', numOrNull(e.target.value))} /></Field>
                <Field label={t('wizard.deposit')}><Input type="number" inputMode="numeric" min={0} value={d.deposit ?? ''} onChange={(e) => set('deposit', numOrNull(e.target.value))} /></Field>
                <Field label={t('wizard.availableFrom')}><Input type="date" value={d.available_from ?? ''} onChange={(e) => set('available_from', e.target.value || null)} /></Field>
              </div>
            )}
          </div>
        )}

        {step === 'size' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.category !== 'apartment' && d.category !== 'room' && (
              <Field label={t('detail.landSize')} hint="m²">
                <Input type="number" inputMode="numeric" min={1} value={d.land_size_m2 ?? ''} onChange={(e) => set('land_size_m2', numOrNull(e.target.value))} />
              </Field>
            )}
            {d.category !== 'land' && (
              <Field label={t('detail.livingArea')} hint="m²">
                <Input type="number" inputMode="numeric" min={1} value={d.living_area_m2 ?? ''} onChange={(e) => set('living_area_m2', numOrNull(e.target.value))} />
              </Field>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-5">
            {d.category !== 'land' && (
              <div className="grid grid-cols-3 gap-3">
                {hasRooms(d.category ?? undefined) && (
                  <Field label={t('detail.bedrooms')}><Input type="number" inputMode="numeric" min={0} max={50} value={d.bedrooms ?? ''} onChange={(e) => set('bedrooms', numOrNull(e.target.value))} /></Field>
                )}
                <Field label={t('detail.bathrooms')}><Input type="number" inputMode="numeric" min={0} max={50} value={d.bathrooms ?? ''} onChange={(e) => set('bathrooms', numOrNull(e.target.value))} /></Field>
                <Field label={t('detail.parking')}><Input type="number" inputMode="numeric" min={0} max={500} value={d.parking_spaces ?? ''} onChange={(e) => set('parking_spaces', numOrNull(e.target.value))} /></Field>
                <Field label={t('detail.floor')}><Input type="number" inputMode="numeric" min={-5} max={200} value={d.floor ?? ''} onChange={(e) => set('floor', numOrNull(e.target.value))} /></Field>
                <Field label={t('detail.yearBuilt')}><Input type="number" inputMode="numeric" min={1850} max={2100} value={d.year_built ?? ''} onChange={(e) => set('year_built', numOrNull(e.target.value))} /></Field>
                <Field label={t('detail.condition')}>
                  <select className={inputClass} value={d.condition ?? ''} onChange={(e) => set('condition', (e.target.value || null) as ListingDraft['condition'])}>
                    <option value="">–</option>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{t(`condition.${c}`)}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">{t('detail.features')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {featuresFor(d.category ?? undefined).map((f: Feature) => (
                  <label key={f} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-gray-200 has-checked:bg-brand-50 has-checked:ring-brand-500">
                    <input type="checkbox" className="size-5 accent-brand-600" checked={d.features.includes(f)}
                      onChange={(e) => set('features', e.target.checked ? [...d.features, f] : d.features.filter((x) => x !== f))} />
                    <span className="text-[15px]">{t(`feature.${f}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 'photos' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t('wizard.photosHint')}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {d.images.map((img, i) => (
                <li key={img} className="relative overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200">
                  <img src={imageUrl(img) ?? ''} alt="" className="aspect-[4/3] w-full object-cover" />
                  {i === 0 && <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-gray-900/85 px-2 py-0.5 text-xs font-bold text-white"><Star className="size-3" />{t('wizard.cover')}</span>}
                  <div className="flex justify-between bg-white px-1.5 py-1">
                    <div className="flex">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('wizard.moveLeft')} className="rounded p-1.5 disabled:opacity-30"><ArrowLeft className="size-4" /></button>
                      <button type="button" disabled={i === d.images.length - 1} onClick={() => move(i, 1)} aria-label={t('wizard.moveRight')} className="rounded p-1.5 disabled:opacity-30"><ArrowRight className="size-4" /></button>
                    </div>
                    <button type="button" onClick={() => set('images', d.images.filter((x) => x !== img))} aria-label={t('common.delete')} className="rounded p-1.5 text-red-600"><Trash2 className="size-4" /></button>
                  </div>
                </li>
              ))}
              {d.images.length < MAX_IMAGES && (
                <li>
                  <label className="flex aspect-[4/3] h-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    {uploading > 0 ? <Loader2 className="size-7 animate-spin" /> : <ImagePlus className="size-7" />}
                    {uploading > 0 ? t('wizard.uploading', { n: uploading }) : t('wizard.addPhotos')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploading > 0} onChange={(e) => addPhotos(e.target.files)} />
                  </label>
                </li>
              )}
            </ul>
          </div>
        )}

        {step === 'description' && (
          <div className="space-y-4">
            <Field label={t('wizard.title')} hint={t('wizard.titleHint')}>
              <Input value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={140} placeholder={suggestedTitle} />
            </Field>
            <Field label={t('detail.description')} hint={`${d.description.length} / 5000`}>
              <Textarea value={d.description} onChange={(e) => set('description', e.target.value)} rows={7} maxLength={5000} placeholder={t('wizard.descriptionPlaceholder')} />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">{t('detail.area')}</p>
              <p className="mb-2 text-xs text-gray-500">{t('wizard.nearbyHint')}</p>
              <ul className="space-y-2">
                {d.nearby.map((n, i) => (
                  <li key={i} className="grid grid-cols-[7.5rem_1fr_5.5rem_auto] gap-2">
                    <select className={inputClass} value={n.kind} aria-label={t('wizard.nearbyKind')}
                      onChange={(e) => set('nearby', d.nearby.map((x, j) => (j === i ? { ...x, kind: e.target.value as NearbyKind } : x)))}>
                      {NEARBY_KINDS.map((k) => <option key={k} value={k}>{t(`nearby.${k}`)}</option>)}
                    </select>
                    <Input value={n.name} aria-label={t('wizard.nearbyName')} placeholder={t('wizard.nearbyName')} onChange={(e) => set('nearby', d.nearby.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Input type="number" min={0} value={n.distance_m} aria-label={t('wizard.nearbyDistance')} onChange={(e) => set('nearby', d.nearby.map((x, j) => (j === i ? { ...x, distance_m: Number(e.target.value) } : x)))} />
                    <button type="button" aria-label={t('common.delete')} onClick={() => set('nearby', d.nearby.filter((_, j) => j !== i))} className="p-2 text-gray-500"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
              {d.nearby.length < 12 && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => set('nearby', [...d.nearby, { kind: 'school', name: '', distance_m: 1000 }])}>
                  <Plus className="size-4" />{t('wizard.addNearby')}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'preview' && d.category && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">{t('wizard.previewHint')}</p>
            <PropertyCard property={{
              id: d.id, category: d.category, transaction: d.transaction, additional_costs: d.additional_costs, available_from: d.available_from, title: d.title, country: d.country, city: d.city, area: d.area,
              lat: d.latitude ?? 0, lng: d.longitude ?? 0, price: d.price, currency: 'USD', land_size_m2: d.land_size_m2,
              living_area_m2: d.living_area_m2, bedrooms: hasRooms(d.category) ? d.bedrooms : null, bathrooms: d.bathrooms,
              parking_spaces: d.parking_spaces, features: d.features, cover_image: d.images[0] ?? null, image_count: d.images.length,
              is_premium: false, early_access_until: null, locked: false, lock_reason: null,
              provider: { id: providerId, name: providerName, type: 'agent', verified }, published_at: null, is_favorite: false,
            }} />
            <Gallery images={d.images} total={d.images.length} locked={false} />
            <div>
              <h2 className="text-xl font-extrabold">{d.title}</h2>
              <p className="text-gray-600">{d.area}, {d.city}</p>
              <p className="mt-1 text-2xl font-extrabold">{d.price ? <PriceText amount={d.price} currency="USD" transaction={d.transaction} /> : '–'}</p>
              <p className="mt-1 text-sm text-gray-600">
                {[d.land_size_m2 && `${t('detail.landSize')}: ${formatArea(d.land_size_m2, locale)}`, d.living_area_m2 && `${t('detail.livingArea')}: ${formatArea(d.living_area_m2, locale)}`].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-3 whitespace-pre-line text-[15px] text-gray-700">{d.description}</p>
              {d.nearby.length > 0 && (
                <ul className="mt-3 text-sm text-gray-700">
                  {d.nearby.filter((n) => n.name.trim()).map((n, i) => <li key={i}>{t(`nearby.${n.kind}`)} · {n.name} — {formatDistance(n.distance_m, locale)}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 'submit' && (
          <div className="space-y-4">
            <Alert tone="info">{t(isActive ? 'wizard.activeNote' : 'wizard.moderationNote')}</Alert>
            {!verified && <Alert tone="warning">{t('wizard.notVerified')}</Alert>}
            <div className="grid gap-2 sm:grid-cols-2">
              {!isActive && <Button variant="secondary" size="lg" disabled={busy} onClick={() => save(false)}>{t('wizard.saveDraft')}</Button>}
              <Button size="lg" disabled={busy || !verified} onClick={() => save(true)} className={isActive ? 'sm:col-span-2' : ''}>
                {busy && <Loader2 className="size-4 animate-spin" />}{t(isActive ? 'wizard.saveChanges' : 'wizard.submit')}
              </Button>
            </div>
          </div>
        )}

        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={stepIndex === 0 ? () => router.back() : back}><ArrowLeft className="size-4" />{t(stepIndex === 0 ? 'common.cancel' : 'common.back')}</Button>
        <div className="flex gap-2">
          {step !== 'submit' && !isNew && !isActive && stepIndex > 0 && <Button variant="secondary" disabled={busy} onClick={() => save(false)}>{t('wizard.saveDraft')}</Button>}
          {step !== 'submit' && <Button onClick={next} disabled={uploading > 0}>{t('common.next')}<ArrowRight className="size-4" /></Button>}
        </div>
      </div>
    </div>
  )
}
