import { Award, BadgeCheck, Clock, FileSpreadsheet, Globe2, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react'
import type { Metadata } from 'next'
import { ReferralCapture } from '@/components/ReferralCapture'
import { Card, LinkButton } from '@/components/ui'
import { getAccount } from '@/lib/account'
import { BRAND } from '@/lib/brand'
import type { MessageKey } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'
import { normalizeReferral } from '@/lib/referral'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('landing.metaTitle'), description: t('landing.subtitle') }
}

/** Landing page for agents, developers and sellers – the link partners share on WhatsApp. */
export default async function ForProvidersPage({ searchParams }: PageProps<'/for-providers'>) {
  const { t } = await getT()
  const ref = normalizeReferral(typeof (await searchParams).ref === 'string' ? ((await searchParams).ref as string) : null)
  const account = await getAccount()
  const cta = account ? (account.provider ? '/provider' : '/provider/onboarding') : '/signup?intent=provider'

  const benefits: [typeof Globe2, MessageKey, MessageKey][] = [
    [Globe2, 'landing.b1', 'landing.b1Text'],
    [BadgeCheck, 'landing.b2', 'landing.b2Text'],
    [MessageCircle, 'landing.b3', 'landing.b3Text'],
    [FileSpreadsheet, 'landing.b4', 'landing.b4Text'],
  ]
  const steps: MessageKey[] = ['landing.s1', 'landing.s2', 'landing.s3', 'landing.s4']
  const faq: [MessageKey, MessageKey][] = [
    ['landing.q1', 'landing.a1'], ['landing.q2', 'landing.a2'], ['landing.q3', 'landing.a3'], ['landing.q4', 'landing.a4'], ['landing.q5', 'landing.a5'],
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <ReferralCapture code={ref} />
      <section className="-mx-4 -mt-4 bg-gradient-to-b from-brand-50 to-transparent px-4 pt-8 pb-2 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-sm font-bold text-gold-700"><Award className="size-4" />{t('landing.kicker')}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">{t('landing.title', { brand: BRAND })}</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600">{t('landing.subtitle')}</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <LinkButton href={cta} size="lg">{t('landing.cta')}</LinkButton>
          <p className="text-sm text-gray-500">{t('landing.ctaNote')}</p>
          {ref && <p className="text-xs text-gray-500">{t('landing.referredBy', { code: ref })}</p>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {benefits.map(([Icon, title, text]) => (
          <Card key={title} className="flex gap-3 p-4">
            <Icon className="mt-0.5 size-6 shrink-0 text-brand-600" />
            <div><p className="font-bold text-gray-900">{t(title)}</p><p className="text-sm text-gray-600">{t(text)}</p></div>
          </Card>
        ))}
      </section>

      <section className="rounded-3xl bg-gray-900 p-6 text-white md:p-8">
        <h2 className="flex items-center gap-2 text-xl font-extrabold"><Award className="size-6 text-gold-100" />{t('landing.foundingTitle')}</h2>
        <ul className="mt-3 space-y-1.5 text-gray-200">
          <li>✓ {t('landing.f1')}</li><li>✓ {t('landing.f2')}</li><li>✓ {t('landing.f3')}</li><li>✓ {t('landing.f4')}</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-gray-900"><Clock className="size-5 text-brand-600" />{t('landing.howTitle')}</h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200/70">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <span className="text-gray-800">{t(s)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-gray-900"><ShieldCheck className="size-5 text-brand-600" />{t('landing.faqTitle')}</h2>
        <div className="space-y-2">
          {faq.map(([q, a]) => (
            <details key={q} className="rounded-2xl bg-white p-4 ring-1 ring-gray-200/70">
              <summary className="cursor-pointer font-semibold text-gray-900">{t(q)}</summary>
              <p className="mt-2 text-gray-600">{t(a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-2 pb-4 text-center">
        <Smartphone className="size-8 text-brand-600" />
        <p className="text-lg font-bold">{t('landing.finalTitle')}</p>
        <LinkButton href={cta} size="lg">{t('landing.cta')}</LinkButton>
      </section>
    </div>
  )
}
