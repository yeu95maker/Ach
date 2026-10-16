import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, type LegalSection } from '@/components/LegalPage'
import { formatDate } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { LEGAL } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('legal.privacy'), alternates: { canonical: '/privacy' } }
}

const Contact = () => (
  <p>
    {LEGAL.name}
    {LEGAL.address && <><br />{LEGAL.address}</>}
    <br />
    <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
  </p>
)

function sectionsEn(): LegalSection[] {
  return [
    { title: '1. Who is responsible', body: <><p>The controller for the processing of personal data in the {LEGAL.brand} website and apps is:</p><Contact /></> },
    {
      title: '2. What we process and why',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Account</b> – email address, password (stored only as a hash), name, language, email preferences. Needed to provide your account (Art. 6(1)(b) GDPR).</li>
          <li><b>Saved properties, saved searches and alerts</b> – so you can find them again and get notified about new matches (Art. 6(1)(b)).</li>
          <li><b>Messages</b> – conversations between you and providers inside the app. We store them so both sides can read them and so we can investigate reports of abuse (Art. 6(1)(b) and (f)).</li>
          <li><b>Provider verification</b> – legal name, contact details, ID or company registration documents. Used only to verify that providers are genuine and kept in a private storage area that only you and our admins can access (Art. 6(1)(b) and (f)).</li>
          <li><b>Listings</b> – texts, photos, price and location of properties. Public listings show only an approximate location unless the provider chooses to show the exact address.</li>
          <li><b>Membership and payments</b> – plan, period and payment status. Card and mobile-money details are entered at Paynow, not with us (Art. 6(1)(b), legal retention duties Art. 6(1)(c)).</li>
          <li><b>Usage</b> – a random, pseudonymous viewer key to count each listing view once per day, plus technical logs (IP address, time, browser) kept by our hosting providers for security (Art. 6(1)(f)).</li>
          <li><b>Location</b> – only when you tap “Near me”. Your position is used for that search and is not stored on our servers unless you save the search.</li>
        </ul>
      ),
    },
    {
      title: '3. Service providers',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Supabase (database, login, file storage) – servers in Frankfurt, Germany.</li>
          <li>Vercel (website hosting) – global edge network; transfers to the USA under the EU–US Data Privacy Framework and standard contractual clauses.</li>
          <li>Mapbox (map tiles) – receives your IP address and the map area you look at.</li>
          <li>Paynow Zimbabwe (payments) – receives the payment amount, reference and your email or phone number when you pay.</li>
          <li>Resend (email delivery) – receives your email address and the notification content.</li>
        </ul>
      ),
    },
    {
      title: '4. Cookies and local storage',
      body: <p>We only use what is technically necessary: a login session, your language and a random viewer key. There is no advertising, no tracking across other sites and no selling of data.</p>,
    },
    {
      title: '5. How long we keep data',
      body: <p>Account data is kept until you delete your account. Deleting it removes your profile, saved properties, searches and notifications at once; listings of your provider account are removed. Payment records are kept as long as tax law requires (up to 10 years) without a link to your deleted account. Server logs are deleted after at most 30 days.</p>,
    },
    {
      title: '6. Your rights',
      body: (
        <>
          <p>You have the right to access, rectification, erasure, restriction, data portability and to object (Art. 15–21 GDPR), and to complain to a data protection authority.</p>
          <p>In <Link className="font-semibold text-brand-700 underline" href="/profile">Profile</Link> you can download all your data and delete your account yourself, in the website and in the apps. For anything else, write to <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
        </>
      ),
    },
    { title: '7. Children', body: <p>{LEGAL.brand} is not directed at children under 16, and we do not knowingly collect their data.</p> },
  ]
}

function sectionsDe(): LegalSection[] {
  return [
    { title: '1. Verantwortlicher', body: <><p>Verantwortlich für die Verarbeitung personenbezogener Daten auf der Website und in den Apps von {LEGAL.brand}:</p><Contact /></> },
    {
      title: '2. Welche Daten wir verarbeiten und warum',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Konto</b> – E-Mail-Adresse, Passwort (nur als Hash), Name, Sprache, E-Mail-Einstellungen. Erforderlich für Ihr Konto (Art. 6 Abs. 1 lit. b DSGVO).</li>
          <li><b>Gemerkte Immobilien, Suchaufträge und Benachrichtigungen</b> – damit Sie sie wiederfinden und über neue Treffer informiert werden (Art. 6 Abs. 1 lit. b).</li>
          <li><b>Nachrichten</b> – Unterhaltungen zwischen Ihnen und Anbietern in der App. Wir speichern sie, damit beide Seiten sie lesen können und um Missbrauchsmeldungen zu prüfen (Art. 6 Abs. 1 lit. b und f).</li>
          <li><b>Anbieter-Verifizierung</b> – Name, Kontaktdaten, Ausweis- oder Registerdokumente. Nur zur Prüfung, dass Anbieter echt sind; abgelegt in einem privaten Speicher, auf den nur Sie und unsere Administratoren zugreifen (Art. 6 Abs. 1 lit. b und f).</li>
          <li><b>Inserate</b> – Texte, Fotos, Preis und Lage. Öffentlich wird nur eine ungefähre Lage gezeigt, außer der Anbieter gibt die genaue Adresse frei.</li>
          <li><b>Mitgliedschaft und Zahlungen</b> – Tarif, Laufzeit, Zahlungsstatus. Karten- und Mobile-Money-Daten geben Sie bei Paynow ein, nicht bei uns (Art. 6 Abs. 1 lit. b, Aufbewahrungspflichten lit. c).</li>
          <li><b>Nutzung</b> – ein zufälliger, pseudonymer Schlüssel, um Aufrufe eines Inserats einmal pro Tag zu zählen, sowie technische Protokolle (IP-Adresse, Zeit, Browser) unserer Hosting-Anbieter zur Sicherheit (Art. 6 Abs. 1 lit. f).</li>
          <li><b>Standort</b> – nur wenn Sie „In meiner Nähe“ antippen. Die Position wird für diese Suche verwendet und nicht auf unseren Servern gespeichert, außer Sie speichern die Suche.</li>
        </ul>
      ),
    },
    {
      title: '3. Dienstleister',
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Supabase (Datenbank, Anmeldung, Dateispeicher) – Server in Frankfurt.</li>
          <li>Vercel (Hosting der Website) – weltweites Netz; Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework und von Standardvertragsklauseln.</li>
          <li>Mapbox (Kartenkacheln) – erhält Ihre IP-Adresse und den angezeigten Kartenausschnitt.</li>
          <li>Paynow Simbabwe (Zahlungen) – erhält Betrag, Referenz und Ihre E-Mail oder Telefonnummer, wenn Sie bezahlen.</li>
          <li>Resend (E-Mail-Versand) – erhält Ihre E-Mail-Adresse und den Inhalt der Benachrichtigung.</li>
        </ul>
      ),
    },
    {
      title: '4. Cookies und lokaler Speicher',
      body: <p>Wir nutzen nur technisch Notwendiges: Anmeldesitzung, Sprache und einen zufälligen Aufruf-Schlüssel. Keine Werbung, kein seitenübergreifendes Tracking, kein Verkauf von Daten.</p>,
    },
    {
      title: '5. Speicherdauer',
      body: <p>Kontodaten speichern wir, bis Sie Ihr Konto löschen. Die Löschung entfernt sofort Profil, gemerkte Immobilien, Suchaufträge und Benachrichtigungen; Inserate Ihres Anbieterkontos werden entfernt. Zahlungsbelege bewahren wir so lange auf, wie das Steuerrecht es verlangt (bis zu 10 Jahre), ohne Verbindung zum gelöschten Konto. Server-Protokolle werden nach höchstens 30 Tagen gelöscht.</p>,
    },
    {
      title: '6. Ihre Rechte',
      body: (
        <>
          <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutzaufsichtsbehörde.</p>
          <p>Im <Link className="font-semibold text-brand-700 underline" href="/profile">Profil</Link> können Sie alle Ihre Daten herunterladen und Ihr Konto selbst löschen – auf der Website und in den Apps. Für alles andere schreiben Sie an <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
        </>
      ),
    },
    { title: '7. Kinder', body: <p>{LEGAL.brand} richtet sich nicht an Kinder unter 16 Jahren; wir erheben wissentlich keine Daten von ihnen.</p> },
  ]
}

export default async function PrivacyPage() {
  const { t, locale } = await getT()
  return (
    <LegalPage title={t('legal.privacy')} updated={t('legal.updated', { date: formatDate(LEGAL.updated, locale) })}
      sections={locale === 'de' ? sectionsDe() : sectionsEn()} />
  )
}
