# App Store und Google Play

Stand: 10.10.2026. Dieses Dokument beschreibt die nativen Apps (iOS, Android), die Store-Einträge und alles, was **du** vor der Einreichung noch erledigen musst. Es unterscheidet klar zwischen „fertig und geprüft“ und „vorbereitet, aber nicht getestet“.

## 1. Überblick

| Bereich | Stand |
| --- | --- |
| Native Projekte `ios/` und `android/` (Capacitor 8) | **fertig**, werden im Workflow „Mobile apps“ gebaut (Android: APK + AAB, iOS: Simulator-Build ohne Signatur) |
| Anmeldung in der App: Sitzung im iOS-Schlüsselbund / Android-Keystore, nur auf diesem Gerät, kein Cloud-Backup | **fertig**, Unit-getestet ist nur die Web-Seite; auf echten Geräten **nicht getestet** |
| Rücksprung aus E-Mail-Links und Microsoft/Google-Login (`dienstwerk://auth-callback`) | **fertig**, Parser unit-getestet; der ganze Ablauf auf Geräten **nicht getestet** |
| Android-Zurück-Taste (schließt erst Dialoge), Statusleiste passend zum Design, Startbildschirm | **fertig**, auf Geräten **nicht getestet** |
| Push: Registrierung in der App, Versand über APNs (iOS) und FCM (Android) in `push-dispatch` | **fertig und unit-getestet** (Signaturen werden echt geprüft, Server-Antworten simuliert). **Nicht** gegen echte Apple-/Google-Server getestet, weil dafür deine Zugangsdaten fehlen. In den Builds ausgeschaltet, bis du sie einrichtest (Abschnitt 6) |
| App-Icons, Startbildschirme, Google-Play-Icon | **fertig** (`resources/icon.svg`, Skript `scripts/native/make-icons.mjs`) |
| Store-Texte in 5 Sprachen | **fertig** in `store/` (fastlane-Format), Limits geprüft mit `node scripts/store/check-listings.mjs` |
| Screenshots iPhone 6,9″, iPad 13″, Android Telefon + Tablet, Feature Graphic, je 5 Sprachen | **fertig**, aus der echten App mit Demodaten erzeugt (`scripts/store/screenshots.mjs`) |
| Datenschutzerklärung und Support-Seite | **Entwurf** in `public/privacy/` und `public/support/`, online unter `…/Ach/privacy/` und `…/Ach/support/`. Betreiberangaben fehlen |
| Hochladen, Signieren, Einreichen | **du** (Abschnitt 4), braucht Apple- und Google-Konten |

## 2. Vor dem ersten Upload – bitte zuerst klären

1. **Name „Dienstwerk“** (Entscheidung vom 16.10.2026). Davor hieß die App „ShiftCare“; der Name wurde wegen „ShiftCare“ und „ShiftCare Pro“ im selben Markt verworfen. Danach hieß sie „Pulshift“; auch dieser Name wurde verworfen, weil es im App Store schon eine Klinik-Schicht-App „Pulshift“ mit ähnlichem Logo gibt. Das neue Icon („D“ mit Haken) unterscheidet sich bewusst davon. Vor der Einreichung bitte noch selbst prüfen: Store-Suche und Markenregister (DPMA, EUIPO). Der Name steht an diesen Stellen: `capacitor.config.ts` (`appName`), `store/*/metadata/*/name.txt` bzw. `title.txt`, `ios/App/App/Info.plist` (`CFBundleDisplayName`), `android/app/src/main/res/values/strings.xml`, `public/manifest.webmanifest`, `src/app/layout/Logo.tsx`.
2. **App-ID** `app.dienstwerk` (iOS und Android). Sie ist nach dem ersten Upload **nicht mehr änderbar** und passt zur Domain `dienstwerk.app` – am besten registrieren. Falls du eine andere willst:
   - `capacitor.config.ts` → `appId`
   - `ios/App/App.xcodeproj/project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER` (2×)
   - `android/app/build.gradle` → `namespace` und `applicationId`, `android/app/src/main/res/values/strings.xml` → `package_name`
   - `android/app/src/main/java/app/dienstwerk/MainActivity.java` in den passenden Ordner verschieben und `package` anpassen
   - danach `npx cap sync`
3. **Betreiberangaben.** Alles in `[eckigen Klammern]` ausfüllen: `public/privacy/index.html`, `public/support/index.html`, `store/ios/metadata/copyright.txt`, `store/ios/metadata/review_information/*`. Danach den gelben „Entwurf“-Hinweis aus beiden Seiten entfernen und prüfen:
   ```sh
   node scripts/store/check-listings.mjs --strict
   ```
   Die Datenschutzerklärung bitte rechtlich prüfen lassen (Auftragsverarbeitung, Rolle der Einrichtungen, Aufbewahrungsfristen).
4. **Backend.** Die Builds zeigen standardmäßig auf das Demo-Projekt. Für echte Kunden ein eigenes Supabase-Projekt (Region EU) verwenden: Variablen `APP_SUPABASE_URL` / `APP_SUPABASE_ANON_KEY` im Workflow bzw. beim lokalen Build setzen. Für die **App-Prüfung** muss das Demo-Projekt mit den Demo-Konten erreichbar bleiben.
5. **Supabase → Authentication → URL Configuration → Redirect URLs** ergänzen: `capacitor://localhost`, `https://localhost`, `dienstwerk://auth-callback`, `dienstwerk://auth-callback/**`. Sonst funktionieren Passwort-Reset und Microsoft/Google-Login in der App nicht.
6. **Links zu Datenschutz und Support.** Die App öffnet `VITE_LEGAL_BASE_URL` + `privacy/` bzw. `support/` (Standard: die GitHub-Pages-Demo). Für den Betrieb auf deine Domain umstellen und die URLs in `store/ios/metadata/*/privacy_url.txt` und `support_url.txt` anpassen.

## 3. Konten

- **Apple Developer Program**: 99 USD pro Jahr. Für ein Unternehmenskonto brauchst du eine D-U-N-S-Nummer.
- **Google Play Console**: 25 USD einmalig. Neue *private* Entwicklerkonten müssen vor der Veröffentlichung einen geschlossenen Test mit mindestens 12 Testern über 14 Tage durchführen; Organisationskonten nicht.
- **EU (Digital Services Act)**: Beide Stores verlangen für den Vertrieb in der EU die Angabe des Händlerstatus („Trader“) mit öffentlich sichtbarer Adresse, Telefon und E-Mail.

## 4. Bauen und hochladen

**Ohne Mac:** Der Workflow `Store release` baut, signiert und lädt hoch. Schritt für Schritt nur mit iPad: [RELEASE-OHNE-MAC.md](RELEASE-OHNE-MAC.md). Die folgenden Abschnitte beschreiben den Weg mit eigenem Mac bzw. Android Studio.

### Gemeinsam
```sh
npm ci
# Backend und Optionen für den Store-Build:
export VITE_SUPABASE_URL=https://<projekt>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key>
export VITE_OAUTH_PROVIDERS=""        # z. B. "azure" oder "azure,google", wenn in Supabase eingerichtet
export VITE_NATIVE_PUSH=false         # true erst nach Abschnitt 6
export VITE_LEGAL_BASE_URL=https://<deine-domain>/
npm run build:native                  # Web-Build mit BASE_PATH=/ + cap sync
```
Versionsnummern pro Release erhöhen: iOS in Xcode (*Version* = `MARKETING_VERSION`, *Build* = `CURRENT_PROJECT_VERSION`), Android in `android/app/build.gradle` (`versionName`, `versionCode` +1).

### iOS (Mac mit Xcode 16 oder neuer)
1. `npx cap open ios` → Target **App** → *Signing & Capabilities* → dein Team wählen. *Push Notifications* ist schon als Capability eingetragen (`App.entitlements`).
2. In App Store Connect eine neue App mit derselben Bundle-ID anlegen, primäre Sprache Deutsch.
3. Xcode → *Product → Archive* → *Distribute App → App Store Connect → Upload*.
4. Build in **TestFlight** auf echten Geräten testen (Checkliste Abschnitt 8), dann zur Prüfung einreichen.
5. Die Texte und Screenshots kannst du per Hand übernehmen oder mit fastlane hochladen: `fastlane deliver --metadata_path store/ios/metadata --screenshots_path store/ios/screenshots` (iPad-Bilder liegen getrennt in `store/ios/screenshots-ipad/` und gehen über App Store Connect).

### Android
1. Upload-Schlüssel einmalig erzeugen und **sicher aufbewahren** (nicht ins Repository):
   ```sh
   keytool -genkeypair -v -keystore dienstwerk-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
2. In `android/app/build.gradle` eine `signingConfigs.release` mit diesem Schlüssel ergänzen (Passwörter aus Umgebungsvariablen lesen) oder das AAB in Android Studio über *Build → Generate Signed Bundle* signieren.
3. `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
4. In der Play Console App anlegen, **Play App Signing** aktivieren, AAB in den Track *Interner Test* hochladen, testen, dann Produktion.
5. Texte und Bilder: `fastlane supply --metadata_path store/android/metadata` oder per Hand (Screenshots: `store/android/screenshots/phone|tablet/<sprache>/`, Feature Graphic: `store/android/metadata/<sprache>/images/featureGraphic.png`, Icon: `store/android/icon-512.png`).

## 5. Store-Angaben (zum Übertragen in die Konsolen)

### App Store Connect
- **Kategorie:** Business, zweite Kategorie Produktivität (`store/ios/metadata/*_category.txt`)
- **Altersfreigabe:** Fragebogen überall „Nein/Keine“ → 4+
- **Preis:** kostenlos, keine In-App-Käufe
- **Exportvorschriften:** Die App verwendet nur Standardverschlüsselung (HTTPS). `ITSAppUsesNonExemptEncryption = false` steht in der `Info.plist`; die Frage erscheint dann nicht.
- **Prüfhinweise und Demo-Konto:** `store/ios/metadata/review_information/` (Leitung `mira.schulz@shiftcare.dev`, Pflegekräfte `anna.becker@shiftcare.dev` und `jonas.weber@shiftcare.dev`, Passwort `ShiftCare!2026`)
- **Kontolöschung (5.1.1(v)):** in der App unter Profil → Konto löschen; die Verwaltung schließt den Antrag ab (sperrt sofort), der Betreiber löscht innerhalb von 30 Tagen
- **App-Datenschutz („Nutrition Label“).** Tracking: **Nein**. Alle Daten: *mit der Identität verknüpft*, Zweck *App-Funktionalität*, nicht für Werbung:

| Datentyp (Apple) | Was in Dienstwerk |
| --- | --- |
| Kontaktinformationen → Name, E-Mail-Adresse, Telefonnummer | Konto, Profil (Telefon freiwillig) |
| Gesundheit & Fitness → Gesundheit | optionaler Kommentar zur Krankmeldung |
| Nutzerinhalte → Fotos oder Videos | Profilfoto (freiwillig), Fotos als Fortbildungsnachweis (freiwillig) |
| Nutzerinhalte → Andere Nutzerinhalte | Mitteilungen, Stationschat, Wünsche, Anträge, Diensttausch, Lesebestätigungen, Dokumente und Fortbildungsnachweise (Dateien) |
| Kennungen → Nutzer-ID | Konto-ID, Personalnummer |
| Sonstige Daten | Dienstplan, Station, Rolle |

Nicht erhoben: Standort, Kontakte, Browserverlauf, Suchverlauf, Käufe, Finanzdaten, Nutzungs- und Diagnosedaten.

### Google Play Console
- **Kategorie:** Business. **Werbung:** Nein. **Zielgruppe:** ab 18. **Inhaltsfreigabe (IARC):** Kategorie „Referenz, Nachrichten oder Bildung“ bzw. Business, alle Fragen „Nein“.
- **App-Zugriff:** „Alle oder einige Funktionen sind eingeschränkt“ → Demo-Konten wie oben.
- **Gesundheits-Apps-Erklärung:** keine Gesundheitsfunktionen (Dienstplanung am Arbeitsplatz).
- **Datensicherheit:** Daten werden **erhoben**, **nicht geteilt** (Supabase, Apple und Google sind Auftragsverarbeiter), Übertragung verschlüsselt, Löschung **in der App** (Profil → Konto löschen) und über die Web-Adresse `…/support/#delete-account` (Google verlangt eine Lösch-URL):

| Datentyp (Google) | Zweck | Pflicht? |
| --- | --- | --- |
| Persönliche Daten → Name, E-Mail-Adresse, Nutzer-IDs | App-Funktionen, Kontoverwaltung | ja |
| Persönliche Daten → Telefonnummer | App-Funktionen | optional |
| Gesundheit und Fitness → Gesundheitsdaten | App-Funktionen (Kommentar zur Krankmeldung) | optional |
| Fotos und Videos → Fotos | App-Funktionen (Profilfoto, Fortbildungsnachweis) | optional |
| Dateien und Dokumente | App-Funktionen (Dokumente/SOPs der Leitung, Fortbildungsnachweise) | optional |
| Nachrichten → Andere In-App-Nachrichten | App-Funktionen (Mitteilungen, Stationschat) | ja |
| App-Aktivitäten → Sonstige nutzergenerierte Inhalte | App-Funktionen (Diensttausch, Lesebestätigungen, Fortbildungsmeldungen) | ja |
| Geräte- oder andere IDs | Push-Benachrichtigungen (FCM-Token) | optional |

## 6. Push-Benachrichtigungen einrichten

Stand 16.10.2026: **iOS ist eingeschaltet** (Builds mit `VITE_NATIVE_PUSH=ios`, Standard in `mobile.yml` und `release.yml`). Android bleibt aus, bis Firebase eingerichtet ist. Ohne `google-services.json` würde die Android-App beim Registrieren abstürzen.

**Server (Demo-Projekt): erledigt.** `push-dispatch` ist deployt. pg_cron ruft die Function jede Minute auf, solange Zustellungen warten (Migration `20261018000100_push_dispatch_cron.sql`). Der Aufruf ist mit einem zufälligen Geheimnis abgesichert, das nur in der Datenbank liegt; der service-role-Schlüssel wird dafür nicht gebraucht. Bei einem neuen Projekt einmal die URL setzen:
```sql
insert into private.app_settings (name, value) values ('functions_url', 'https://<ref>.supabase.co/functions/v1')
on conflict (name) do update set value = excluded.value;
```

**Was du einmal machst (iOS, 10 Min.):**
1. https://developer.apple.com/account/resources/authkeys/list → **„+“** → Name `Dienstwerk Push` → **Apple Push Notifications service (APNs)** anhaken → *Configure*: Umgebung **Sandbox & Production** → *Continue* → *Register* → **Download**. Die `.p8`-Datei gibt es nur einmal; die **Key ID** steht daneben.
2. Supabase-Dashboard → Projekt → **Edge Functions → Secrets** → *Add new secret*, fünf Mal:

| Name | Wert |
| --- | --- |
| `APNS_KEY_P8` | kompletter Inhalt der `.p8`-Datei inkl. `-----BEGIN PRIVATE KEY-----`/`-----END PRIVATE KEY-----` |
| `APNS_KEY_ID` | Key ID aus Schritt 1 |
| `APNS_TEAM_ID` | deine Team-ID (Membership details) |
| `APNS_TOPIC` | `app.dienstwerk` |
| `APNS_PRODUCTION` | `true` (TestFlight und App Store nutzen die Produktions-Umgebung) |

Die Schlüssel bitte **nicht in den Chat** kopieren, nur direkt in Supabase eintragen.

3. Test: TestFlight-App öffnen → **Profil → Push-Benachrichtigungen einschalten** → erlauben. Danach als Leitung (z. B. in der Web-Demo als `mira.schulz@shiftcare.dev`) etwas auslösen, das dich betrifft, etwa eine Chat-Nachricht auf deiner Station oder eine Tauschanfrage an dich. Innerhalb von etwa einer Minute erscheint die Mitteilung; Tippen öffnet die App.

**Android (später):** Firebase-Projekt anlegen, Android-App `app.dienstwerk` hinzufügen. `google-services.json` als CI-Secret ablegen, nicht ins öffentliche Repository einchecken. Den Dienstkonto-Schlüssel als Supabase-Secret `FCM_SERVICE_ACCOUNT` setzen, dann GitHub-Variable `APP_NATIVE_PUSH=ios,android`.

Benachrichtigungen enthalten nur einen allgemeinen Titel (z. B. „Dienst geändert“) und den Stationsnamen, **nie Gesundheitsdaten**. Ungültige Tokens (App gelöscht) werden automatisch entfernt.

## 7. Screenshots, Texte und Icons neu erzeugen

```sh
# Icons und Startbildschirme aus resources/icon.svg
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/native/make-icons.mjs

# Screenshots: frisch geseedete lokale Datenbank, Test-Gateway und Dev-Server laufen lassen
PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./scripts/db-test.sh
PGHOST=/tmp PGPORT=54329 PGUSER=postgres PGDATABASE=shiftcare_test node scripts/e2e/gateway.mjs &
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local-test-anon-key-000000 VITE_OAUTH_PROVIDERS= npx vite &
CHROMIUM_PATH=/opt/pw-browsers/chromium PGHOST=/tmp PGPORT=54329 PGUSER=postgres PGDATABASE=shiftcare_test \
  node scripts/store/screenshots.mjs          # optional --only=de,en

# Prüfen (läuft auch in npm run check)
node scripts/store/check-listings.mjs
```
Die Texte liegen als einzelne Dateien in `store/ios/metadata/<sprache>/` und `store/android/metadata/<sprache>/`. Limits: Name/Titel 30, Untertitel 30, Keywords 100, Werbetext 170, Kurzbeschreibung 80, Beschreibung 4000 Zeichen.

## 8. Test auf echten Geräten (vor der Einreichung)

Diese Punkte konnten hier nicht geprüft werden, weil es keine Geräte, keinen Mac und keine Apple-/Google-Zugangsdaten gibt:
- [ ] Anmeldung, App schließen und neu öffnen → bleibt angemeldet (Schlüsselbund/Keystore)
- [ ] Abmelden → nach Neustart abgemeldet
- [ ] „Passwort vergessen“ → Link in der E-Mail auf dem Gerät öffnen → App öffnet „Neues Passwort“
- [ ] Microsoft/Google-Anmeldung (falls aktiviert) → System-Browser → zurück in der App angemeldet
- [ ] Android: Zurück-Taste schließt Dialoge, dann Seite zurück, auf der Startseite App verlassen
- [ ] Hell/Dunkel: Statusleiste lesbar; Notch und Home-Indikator verdecken nichts
- [ ] Profil → Datenschutz / Hilfe & Kontakt öffnen die Seiten im System-Browser
- [ ] Push (nach Abschnitt 6): erlauben, empfangen, antippen, abschalten
- [ ] iPad: Hoch- und Querformat

## 9. Prüfungsrisiken und wie die App damit umgeht

- **Apple 4.2 (Mindestfunktionalität, „nur eine Website“):** Dienstwerk ist eine vollständige Arbeits-App mit Anmeldung, nativen Push-Benachrichtigungen, sicherer Sitzung im Schlüsselbund und Deep Links. Ein Restrisiko bleibt bei Web-Hüllen immer. Gegenmittel, falls Apple ablehnt: Biometrie-Entsperrung (B2) und Offline-Dienstplan (B9) nachrüsten.
- **Apple 5.1.1(v) (Konto löschen):** Konten entstehen nur durch Einladung des Arbeitgebers, nicht in der App. Löschung beantragen: Profil → Hilfe & Kontakt → „Konto löschen“, die Einrichtung kann sofort deaktivieren. Falls Apple eine Löschung direkt in der App verlangt, ist das als eigener Punkt nachzurüsten (OPEN_POINTS B17).
- **Apple 4.8 (Anmeldedienste):** Google/Microsoft-Anmeldung funktioniert nur für Konten, die der Arbeitgeber angelegt hat (Ausnahme für Unternehmenskonten). Im Prüf-Build sind die Knöpfe ausgeblendet (`VITE_OAUTH_PROVIDERS=""`).
- **Alternative bei B2B-Kunden:** Apple *Custom Apps* (Verteilung über Apple Business Manager nur an bestimmte Organisationen) und Google *Managed Google Play* (private App). Beides vermeidet die öffentliche Listung, die Prüfung bleibt.
