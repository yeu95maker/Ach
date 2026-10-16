import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/LegalPage'
import { getT } from '@/lib/i18n/server'
import { LEGAL } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('legal.support'), alternates: { canonical: '/support' } }
}

/** Support page – also the "Support URL" in App Store Connect and Google Play. */
export default async function SupportPage() {
  const { t, locale } = await getT()
  const de = locale === 'de'
  const mail = <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
  const link = (href: string, label: string) => <Link className="font-semibold text-brand-700 underline" href={href}>{label}</Link>
  return (
    <LegalPage title={t('legal.support')} intro={de ? <>Wir helfen gern – schreiben Sie an {mail}. Wir antworten in der Regel innerhalb von zwei Werktagen.</> : <>We are happy to help – write to {mail}. We usually reply within two working days.</>}
      sections={de ? [
        { title: 'Wie kontaktiere ich einen Anbieter?', body: <p>Öffnen Sie das Inserat und tippen Sie auf „{t('message.provider')}“. Die Unterhaltung finden Sie danach unter {link('/messages', 'Nachrichten')}.</p> },
        { title: 'Wie werde ich verifizierter Anbieter?', body: <p>Registrieren Sie sich und öffnen Sie {link('/provider', 'Anbieter')}. Nach dem Hochladen Ihrer Nachweise prüfen wir Ihr Konto, meist innerhalb von 1–2 Werktagen.</p> },
        { title: 'Ein Inserat wirkt verdächtig', body: <p>Tippen Sie im Inserat auf „{t('report.title')}“. Zahlen Sie niemals Geld, bevor Sie die Immobilie besichtigt und den Anbieter geprüft haben.</p> },
        { title: 'Premium', body: <p>Premium gilt für Ihr Konto – auf der Website und in der App – und verlängert sich nicht automatisch. Details: {link('/membership', 'Mitgliedschaft')}.</p> },
        { title: 'Daten herunterladen oder Konto löschen', body: <p>Beides geht jederzeit unter {link('/profile', 'Profil')} – auch in der App. Mehr dazu in der {link('/privacy', 'Datenschutzerklärung')}.</p> },
      ] : [
        { title: 'How do I contact a provider?', body: <p>Open the listing and tap “{t('message.provider')}”. You will find the conversation under {link('/messages', 'Messages')}.</p> },
        { title: 'How do I become a verified provider?', body: <p>Sign up and open {link('/provider', 'Provider')}. After you upload your documents we review your account, usually within 1–2 working days.</p> },
        { title: 'A listing looks suspicious', body: <p>Tap “{t('report.title')}” on the listing. Never pay money before you have viewed the property and checked the provider.</p> },
        { title: 'Premium', body: <p>Premium belongs to your account – on the website and in the app – and does not renew automatically. Details: {link('/membership', 'Membership')}.</p> },
        { title: 'Download my data or delete my account', body: <p>You can do both at any time in {link('/profile', 'Profile')} – also in the app. More in the {link('/privacy', 'privacy policy')}.</p> },
      ]} />
  )
}
