import { Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/core/errors'
import { isoDateInTimeZone, zonedDateTime } from '@/domain/dates'
import { EVENT_CATEGORIES, NEWS_CATEGORIES, validateNewsDraft } from '@/domain/news'
import type { NewsCategory } from '@/domain/types'
import { useEmployment } from '@/features/tenant/TenantProvider'
import { Button, Field, Input, Select, Sheet, Textarea, cn, useToast } from '@/ui'
import { NEWS_STYLE } from './newsStyles'
import { useNewsTargets, usePublishNews } from './useNews'

export function ComposeNewsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const employment = useEmployment()
  const toast = useToast()
  const targets = useNewsTargets()
  const publish = usePublishNews()
  const tz = employment.hospital.timezone

  const [category, setCategory] = useState<NewsCategory>('information')
  const [target, setTarget] = useState<string>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [important, setImportant] = useState(false)
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [location, setLocation] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const options = targets.data ?? []
  const selectedTarget = options.find((o) => (o.unitId ?? 'hospital') === target) ?? options.find((o) => o.unitId) ?? options[0]
  const showEvent = EVENT_CATEGORIES.has(category) || !!date

  const reset = () => {
    setCategory('information')
    setTitle('')
    setBody('')
    setImportant(false)
    setDate('')
    setFrom('')
    setTo('')
    setLocation('')
    setErrors([])
  }

  const submit = () => {
    const eventStartsAt = date ? zonedDateTime(date, from || '00:00', tz) : null
    const eventEndsAt = date && to ? zonedDateTime(date, to, tz) : null
    const problems = validateNewsDraft({ title, body, eventStartsAt, eventEndsAt })
    if (!selectedTarget) problems.push('news.errors.target')
    setErrors(problems)
    if (problems.length || !selectedTarget) return
    publish.mutate(
      {
        hospitalId: employment.hospital.id,
        unitId: selectedTarget.unitId,
        category,
        title,
        body,
        priority: important ? 'important' : 'normal',
        eventStartsAt,
        eventEndsAt,
        location: date ? location : null,
      },
      {
        onSuccess: () => {
          toast.show({ tone: 'success', title: t('news.published'), description: t('news.publishedHint') })
          reset()
          onClose()
        },
        onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
      },
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('news.composeTitle')}
      description={t('news.composeSubtitle')}
      size="lg"
      footer={
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" icon={<Send className="size-[18px]" />} loading={publish.isPending} onClick={submit}>
            {t('news.send')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('news.categoryLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {NEWS_CATEGORIES.map((c) => {
              const s = NEWS_STYLE[c]
              const active = c === category
              return (
                <label
                  key={c}
                  className={cn(
                    'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                    active ? 'bg-primary text-on-primary ring-primary' : 'bg-surface text-text-2 ring-border hover:text-text',
                  )}
                >
                  <input type="radio" name="news-category" value={c} checked={active} onChange={() => setCategory(c)} className="sr-only" />
                  <s.icon className="size-4" aria-hidden />
                  {t(`news.category.${c}`)}
                </label>
              )
            })}
          </div>
        </fieldset>

        <Field label={t('news.audience')} htmlFor="news-target" hint={t('news.audienceHint')}>
          <Select id="news-target" value={selectedTarget ? (selectedTarget.unitId ?? 'hospital') : ''} onChange={(e) => setTarget(e.target.value)}>
            {options.map((o) => (
              <option key={o.unitId ?? 'hospital'} value={o.unitId ?? 'hospital'}>
                {o.unitName ?? t('news.wholeHospital')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('news.titleLabel')} htmlFor="news-title" error={errors.includes('news.errors.title') ? t('news.errors.title') : null}>
          <Input id="news-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('news.titlePlaceholder')} />
        </Field>

        <Field label={t('news.bodyLabel')} htmlFor="news-body" error={errors.includes('news.errors.body') ? t('news.errors.body') : null}>
          <Textarea id="news-body" rows={5} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} placeholder={t('news.bodyPlaceholder')} />
        </Field>

        {showEvent && (
          <div className="space-y-4 rounded-2xl bg-surface-2/60 p-4">
            <p className="text-sm font-semibold">{t('news.eventSection')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('news.date')} htmlFor="news-date" optional optionalLabel={t('common.optional')}>
                <Input id="news-date" type="date" value={date} min={isoDateInTimeZone(new Date(), tz)} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t('news.from')} htmlFor="news-from">
                <Input id="news-from" type="time" value={from} disabled={!date} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field
                label={t('news.to')}
                htmlFor="news-to"
                error={errors.includes('news.errors.endBeforeStart') ? t('news.errors.endBeforeStart') : null}
              >
                <Input id="news-to" type="time" value={to} disabled={!date} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Field label={t('news.location')} htmlFor="news-location" optional optionalLabel={t('common.optional')}>
              <Input id="news-location" value={location} maxLength={200} disabled={!date} onChange={(e) => setLocation(e.target.value)} placeholder={t('news.locationPlaceholder')} />
            </Field>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 p-4">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-primary)]" />
          <span>
            <span className="block text-[15px] font-medium">{t('news.important')}</span>
            <span className="block text-sm text-text-3">{t('news.importantHint')}</span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}
