# Einreichung bei Apple und Google – Checkliste

Stand: 16.10.2026 (Umbenennung in Dienstwerk). Alles, was sich im Code und im Repository vorbereiten lässt, ist fertig. Offen sind nur Schritte, die der Betreiber selbst erledigen muss: Konten, Rechtliches und Firmendaten.

## Fertig (im Repository)

| Bereich | Stand | Wo |
| --- | --- | --- |
| Native Apps iOS + Android (Capacitor) | baut auf GitHub (Workflow „Mobile apps“) | `ios/`, `android/` |
| Signieren + Hochladen ohne Mac | Workflow „Store release“ (iOS → TestFlight, Android → AAB) | `docs/RELEASE-OHNE-MAC.md` |
| Store-Texte in 5 Sprachen | Name, Untertitel, Beschreibung, Stichwörter, Werbetext, Kurzbeschreibung, Versionshinweise | `store/ios/metadata`, `store/android/metadata` |
| Screenshots | iPhone 6,9″, iPad 13″, Android Smartphone + Tablet, je 8, in 5 Sprachen; Feature-Grafik | `store/*/screenshots*` |
| Prüfhinweise für Apple mit Demo-Konten | Leitung + 2 Pflegekräfte, Passwort `ShiftCare!2026` | `store/ios/metadata/review_information/notes.txt` |
| Datenschutzerklärung + Support-Seite (DE/EN) | vollständig, mit Betreiberangaben und Impressum | `public/privacy/`, `public/support/` |
| Kontolöschung in der App (Apple 5.1.1(v), Google) | Profil → Konto löschen; Verwaltung schließt ab | Migration `20261017000200_account_deletion.sql` |
| Angaben „App-Datenschutz“ (Apple) und „Datensicherheit“ (Google) | Tabellen zum Übertragen | `docs/APP-STORES.md` §5 |
| Verschlüsselungs-Exportfrage | entfällt (`ITSAppUsesNonExemptEncryption = false`) | `ios/App/App/Info.plist` |
| Prüfskript | `node scripts/store/check-listings.mjs --strict` (grün) | |

## Offen – nur du kannst das

### 1. Betreiberangaben ✅
Am 11.10.2026 eingetragen: Betreiber Yeukai A Kamalo (Dossenheim), Kontakt-E-Mail für Datenschutz und Support, Copyright, Prüfkontakt und Rechenzentrum Frankfurt am Main. Auf der Support-Seite steht jetzt ein Impressum. Der „Entwurf“-Hinweis ist entfernt, `check-listings.mjs --strict` ist grün.

Noch selbst zu erledigen:
- **Telefonnummer für Apples Prüfung** direkt in App Store Connect eintragen (*App-Prüfung → Kontaktinformationen*). Sie steht bewusst nicht im öffentlichen Repository.
- **Datenschutzerklärung rechtlich prüfen lassen.** Besonders: ob ein Datenschutzbeauftragter benannt werden muss, die Rolle als Auftragsverarbeiter und der AVV mit den Kliniken. Die App verarbeitet Krankmeldungen (Art. 9 DSGVO).
- Später besser eine eigene geschäftliche E-Mail-Adresse und Domain verwenden (z. B. support@dienstwerk.app).

### 2. Entwicklerkonten
Ohne Firma (GmbH, UG …) gilt:
- **Apple Developer Program** als **Einzelperson** („Individual“), 99 USD pro Jahr. Als Verkäufer steht dein Name im Store. Auch Einzelunternehmer melden sich bei Apple als Einzelperson an. Ein späterer Wechsel zur Organisation ist über den Apple-Support möglich, die App bleibt dabei erhalten.
- **Google Play Console** als **privates Konto** („Personal“), 25 USD einmalig.
  > ⚠️ Private Konten brauchen vor der ersten Veröffentlichung einen **geschlossenen Test mit mindestens 12 Testern über 14 Tage** (z. B. Kolleginnen und Kollegen mit einem Google-Konto). Den Test kannst du sofort nach dem ersten Upload starten. Ein Organisationskonto (Gewerbe + D-U-N-S-Nummer) würde das ersparen, dauert aber Wochen.
- **Händlerstatus in der EU (DSA):** Beide Stores fragen, ob du **Händler** („Trader“) bist. Wer die App beruflich anbietet, z. B. später an Kliniken verkauft, ist Händler. Dann zeigen die Stores in der EU **Name, Adresse, Telefon und E-Mail öffentlich** an. Wenn du deine Privatadresse nicht zeigen willst: eine Geschäftsadresse (z. B. Büro- oder Postservice) und eine eigene geschäftliche Telefonnummer verwenden.
- Wer die App gewerblich anbietet, braucht in Deutschland eine **Gewerbeanmeldung** (Einzelunternehmen, beim Gewerbeamt, ca. 20–60 €). Das ändert nichts an der Kontoart bei Apple.

### 3. Backend für echte Kunden – und für die Prüfung
Die Store-Builds zeigen im Moment auf das **Demo-Projekt**. Für die Einreichung gibt es zwei Wege:
- **a) Erst einmal mit der Demo einreichen.** Das ist schnell und sicher: Die Prüfer nutzen die Demo-Konten. Für echte Kunden folgt dann ein Update mit dem Produktions-Backend.
- **b) Gleich mit eigenem Produktions-Projekt (empfohlen, wenn Kunden schon warten).** Du legst ein neues Supabase-Projekt in der Region EU an. Ich spiele alle Migrationen ein und lege dort eine getrennte Demo-Einrichtung mit den Demo-Konten für die Prüfer an; sie ist per RLS von echten Kunden getrennt. Danach setzt du bei GitHub unter *Settings → Variables* `APP_SUPABASE_URL` und `APP_SUPABASE_ANON_KEY`.

⚠️ **Nach der Umbenennung neu eintragen** (Demo-Projekt): In Supabase unter **Authentication → URL Configuration → Redirect URLs** werden `dienstwerk://auth-callback` und `dienstwerk://auth-callback/**` gebraucht. `capacitor://localhost` und `https://localhost` bleiben. Die alten `pulshift://…`-Einträge können weg. Bei einem eigenen Produktions-Projekt (Weg b) müssen dieselben vier Einträge dort ebenfalls gesetzt werden.

### 4. Push-Benachrichtigungen (iOS)
In der App und auf dem Demo-Server ist alles eingeschaltet. Es fehlen nur noch der APNs-Schlüssel und die 5 Supabase-Secrets, siehe `docs/APP-STORES.md` §6. Ohne Schlüssel funktioniert die App weiter normal, es kommen dann nur keine Mitteilungen an.

### 5. Name und Domain
Am 16.10.2026 von „Pulshift“ in **Dienstwerk** umbenannt, weil es eine gleichnamige App gibt. Store-Suche und Markenregister (DPMA, EUIPO) auf „Dienstwerk“ prüfen. Die Domain `dienstwerk.app` sichern. Die App-ID `app.dienstwerk` lässt sich nach dem ersten Upload nicht mehr ändern.

## Einreichen – Schritt für Schritt

### Apple (App Store Connect)
1. App-ID `app.dienstwerk` mit Push Notifications registrieren, App in App Store Connect anlegen. Primärsprache: Deutsch. Details in `docs/RELEASE-OHNE-MAC.md` §2.
2. API-Schlüssel als 4 GitHub-Secrets hinterlegen (§3), dann **Actions → Store release → ios** starten. Der Build landet in TestFlight.
3. Auf dem iPad über TestFlight testen. Die Checkliste dafür steht in `docs/APP-STORES.md` §8.
4. Für jede Sprache aus `store/ios/metadata/<sprache>/` übernehmen: Name, Untertitel, Werbetext, Beschreibung, Stichwörter, Support-URL, Datenschutz-URL. Screenshots aus `store/ios/screenshots` und `store/ios/screenshots-ipad` hochladen.
5. **App-Datenschutz:** laut Tabelle in `docs/APP-STORES.md` §5. Tracking: Nein.
6. **Altersfreigabe:** alle Fragen „Nein“ (ergibt 4+). **Kategorie:** Business, zweite Kategorie Produktivität. **Preis:** kostenlos.
7. **App-Prüfung → Anmeldedaten:** `mira.schulz@shiftcare.dev` / `ShiftCare!2026`. Die Hinweise aus `review_information/notes.txt` hineinkopieren.
8. Den Build auswählen, dann **Zur Prüfung einreichen**.
9. Wenn die App nur für Kliniken mit Link erreichbar sein soll: die Verteilung als **„nicht gelistete App“** beantragen.

### Google (Play Console)
1. Die App anlegen. Standardsprache: Deutsch. Typ: App. Kostenlos.
2. **Actions → Store release → android** starten und das AAB aus *Artifacts* herunterladen. Unter *Testen → Interner Test* hochladen.
3. **Store-Eintrag** für jede Sprache: Titel, Kurz- und Vollbeschreibung aus `store/android/metadata/<sprache>/`. Feature-Grafik und Screenshots aus `store/android/…`, das Icon `store/android/icon-512.png`.
4. **App-Inhalte:**
   - **Datenschutzerklärung:** die URL der Datenschutzseite
   - **App-Zugriff:** „Eingeschränkt“, mit den Demo-Konten
   - **Werbung:** Nein
   - **Inhaltsfreigabe:** Fragebogen, alle Fragen „Nein“
   - **Zielgruppe:** ab 18
   - **Datensicherheit:** laut Tabelle in `docs/APP-STORES.md` §5, Lösch-URL `…/support/#delete-account`
   - **Gesundheits-Apps:** keine Gesundheitsfunktionen
   - **Behörden-App:** Nein
   - **Finanzfunktionen:** keine
5. Bei einem privaten Konto: zuerst den geschlossenen Test (12 Tester, 14 Tage). Danach unter **Produktion → Release erstellen** einreichen.
