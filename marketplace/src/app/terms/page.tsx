import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/LegalPage'
import { formatDate } from '@/lib/format'
import { getT } from '@/lib/i18n/server'
import { LEGAL } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).t('legal.terms'), alternates: { canonical: '/terms' } }
}

const EN: LegalSection[] = [
  { title: '1. The service', body: <p>{LEGAL.brand} is a marketplace where verified providers (owners, agents, developers) list properties and customers search and contact them through in-app messages. {LEGAL.brand} is not a party to any sale or rental agreement and does not act as an estate agent.</p> },
  { title: '2. Accounts', body: <p>You must be at least 18 years old and give truthful details. Keep your password secret. One provider account per person or company; team members are invited by the account owner.</p> },
  { title: '3. Listings', body: <p>Providers may only list properties they are authorised to market, with truthful descriptions, real photos and current prices, and must confirm availability regularly. We review listings and may reject, pause or remove them, and suspend accounts, in particular after reports of fraud or misleading content.</p> },
  { title: '4. Messages and conduct', body: <p>Use messages only to communicate about listings. No spam, harassment, discrimination or requests for advance payments outside a proper contract. Never pay a deposit before you have seen the property and verified the provider’s identity.</p> },
  { title: '5. Premium', body: <p>Premium is a prepaid membership for one month or one year that unlocks members-only listings, early access, advanced filters and unlimited saved properties and alerts. It does not renew automatically. Prices are shown before payment. Premium is purchased on the website; it cannot be bought inside the iOS or Android app.</p> },
  { title: '6. Liability', body: <p>Listing content is the responsibility of the provider. We are liable without limitation for intent and gross negligence and for injury to life, body or health; otherwise only for breach of essential obligations and limited to typical, foreseeable damage. Mandatory consumer rights remain unaffected.</p> },
  { title: '7. Ending your account', body: <p>You can delete your account at any time in Profile. We may terminate accounts that breach these terms.</p> },
  { title: '8. Contact', body: <p>{LEGAL.name} · <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p> },
]

const DE: LegalSection[] = [
  { title: '1. Leistung', body: <p>{LEGAL.brand} ist ein Marktplatz, auf dem verifizierte Anbieter (Eigentümer, Makler, Bauträger) Immobilien inserieren und Kunden sie suchen und per In-App-Nachricht kontaktieren. {LEGAL.brand} ist nicht Partei eines Kauf- oder Mietvertrags und tritt nicht als Makler auf.</p> },
  { title: '2. Konten', body: <p>Sie müssen mindestens 18 Jahre alt sein und wahre Angaben machen. Halten Sie Ihr Passwort geheim. Ein Anbieterkonto pro Person oder Firma; Teammitglieder lädt der Kontoinhaber ein.</p> },
  { title: '3. Inserate', body: <p>Anbieter dürfen nur Immobilien inserieren, die sie vermarkten dürfen – mit wahren Beschreibungen, echten Fotos und aktuellen Preisen – und müssen die Verfügbarkeit regelmäßig bestätigen. Wir prüfen Inserate und können sie ablehnen, pausieren oder entfernen sowie Konten sperren, insbesondere nach Meldungen über Betrug oder irreführende Inhalte.</p> },
  { title: '4. Nachrichten und Verhalten', body: <p>Nutzen Sie Nachrichten nur zur Kommunikation über Inserate. Kein Spam, keine Belästigung, keine Diskriminierung, keine Vorauszahlungen außerhalb eines ordentlichen Vertrags. Zahlen Sie nie eine Anzahlung, bevor Sie die Immobilie gesehen und die Identität des Anbieters geprüft haben.</p> },
  { title: '5. Premium', body: <p>Premium ist eine im Voraus bezahlte Mitgliedschaft für einen Monat oder ein Jahr. Sie schaltet Mitglieder-Inserate, Frühzugang, erweiterte Filter sowie unbegrenzt gemerkte Immobilien und Suchaufträge frei und verlängert sich nicht automatisch. Preise werden vor der Zahlung angezeigt. Premium wird auf der Website erworben; in der iOS- und Android-App ist kein Kauf möglich.</p> },
  { title: '6. Haftung', body: <p>Für Inhalte der Inserate ist der Anbieter verantwortlich. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit; im Übrigen nur bei Verletzung wesentlicher Pflichten und begrenzt auf den typischen, vorhersehbaren Schaden. Zwingende Verbraucherrechte bleiben unberührt.</p> },
  { title: '7. Kontoende', body: <p>Sie können Ihr Konto jederzeit im Profil löschen. Wir können Konten kündigen, die gegen diese Bedingungen verstoßen.</p> },
  { title: '8. Kontakt', body: <p>{LEGAL.name} · <a className="font-semibold text-brand-700 underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p> },
]

export default async function TermsPage() {
  const { t, locale } = await getT()
  return <LegalPage title={t('legal.terms')} updated={t('legal.updated', { date: formatDate(LEGAL.updated, locale) })} sections={locale === 'de' ? DE : EN} />
}
