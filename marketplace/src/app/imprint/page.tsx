import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { getT } from '@/lib/i18n/server'
import { LEGAL } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('legal.imprint'), alternates: { canonical: '/imprint' } }
}

/** Impressum (§ 5 DDG) – operator details come from LEGAL_* environment variables. */
export default async function ImprintPage() {
  const { t, locale } = await getT()
  const de = locale === 'de'
  return (
    <LegalPage title={t('legal.imprint')} sections={[
      {
        title: de ? 'Anbieter' : 'Operator',
        body: <p className="whitespace-pre-line">{LEGAL.name}{LEGAL.address && `\n${LEGAL.address}`}</p>,
      },
      {
        title: de ? 'Kontakt' : 'Contact',
        body: (
          <p>
            E-Mail: <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
            {LEGAL.phone && <><br />{de ? 'Telefon' : 'Phone'}: {LEGAL.phone}</>}
          </p>
        ),
      },
      {
        title: de ? 'Streitbeilegung' : 'Dispute resolution',
        body: <p>{de
          ? 'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.'
          : 'We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.'}</p>,
      },
    ]} />
  )
}
