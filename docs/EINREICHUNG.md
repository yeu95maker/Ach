# Einreichung bei Apple und Google – Checkliste

Stand: 11.10.2026. Alles, was sich im Code und im Repository vorbereiten lässt, ist fertig. Offen sind nur Schritte, die der Betreiber selbst erledigen muss: Konten, Rechtliches und Firmendaten.

## Fertig (im Repository)

| Bereich | Stand | Wo |
| --- | --- | --- |
| Native Apps iOS + Android (Capacitor) | baut auf GitHub (Workflow „Mobile apps“) | `ios/`, `android/` |
| Signieren + Hochladen ohne Mac | Workflow „Store release“ (iOS → TestFlight, Android → AAB) | `docs/RELEASE-OHNE-MAC.md` |
| Store-Texte in 5 Sprachen | Name, Untertitel, Beschreibung, Stichwörter, Werbetext, Kurzbeschreibung, Versionshinweise | `store/ios/metadata`, `store/android/metadata` |
| Screenshots | iPhone 6,9″, iPad 13″, Android Smartphone + Tablet, je 8, in 5 Sprachen; Feature-Grafik | `store/*/screenshots*` |
| Prüfhinweise für Apple mit Demo-Konten | Leitung + 2 Pflegekräfte, Passwort `ShiftCare!2026` | `store/ios/metadata/review_information/notes.txt` |
| Datenschutzerklärung + Support-Seite (DE/EN) | inhaltlich vollständig, **Betreiberangaben fehlen** | `public/privacy/`, `public/support/` |
| Kontolöschung in der App (Apple 5.1.1(v), Google) | Profil → Konto löschen; Verwaltung schließt ab | Migration `20261017000200_account_deletion.sql` |
| Angaben „App-Datenschutz“ (Apple) und „Datensicherheit“ (Google) | Tabellen zum Übertragen | `docs/APP-STORES.md` §5 |
| Verschlüsselungs-Exportfrage | entfällt (`ITSAppUsesNonExemptEncryption = false`) | `ios/App/App/Info.plist` |
| Prüfskript | `node scripts/store/check-listings.mjs --strict` (schlägt nur noch wegen der Betreiber-Platzhalter fehl) | |

## Offen – nur du kannst das

### 1. Betreiberangaben (blockiert die Einreichung)
Schick mir die folgenden Angaben, ich trage sie ein und entferne den „Entwurf“-Hinweis:
- **Betreiber:** Firmenname bzw. dein Name, Anschrift, E-Mail für Datenschutz und für Support, ggf. Datenschutzbeauftragte/r
- **Kontakt für Apples Prüfung:** Vorname, Nachname, E-Mail, Telefon. Diese Angaben sieht nur Apple.
- **Copyright-Zeile,** z. B. `2026 Musterfirma GmbH`
- **Rechenzentrum** des Supabase-Projekts, z. B. „Frankfurt am Main, EU“

Die Datenschutzerklärung bitte rechtlich prüfen lassen. Die App verarbeitet Krankmeldungen (Art. 9 DSGVO), und gegenüber den Kliniken bist du Auftragsverarbeiter. Für die Kliniken brauchst du außerdem einen Vertrag zur Auftragsverarbeitung (AVV).

### 2. Entwicklerkonten
- **Apple Developer Program**, 99 USD pro Jahr. Für eine Business-App am besten **als Organisation** (dafür braucht es eine D-U-N-S-Nummer, kostenlos über Apple).
- **Google Play Console**, 25 USD einmalig. Auch hier am besten **als Organisation**.
  > ⚠️ Für **private** Google-Konten (ab Nov. 2023) verlangt Google vor der ersten Veröffentlichung einen **geschlossenen Test mit mindestens 12 Testern über 14 Tage**. Organisationskonten sind davon ausgenommen.

### 3. Backend für echte Kunden – und für die Prüfung
Die Store-Builds zeigen im Moment auf das **Demo-Projekt**. Für die Einreichung gibt es zwei Wege:
- **a) Erst einmal mit der Demo einreichen.** Das ist schnell und sicher: Die Prüfer nutzen die Demo-Konten. Für echte Kunden folgt dann ein Update mit dem Produktions-Backend.
- **b) Gleich mit eigenem Produktions-Projekt (empfohlen, wenn Kunden schon warten).** Du legst ein neues Supabase-Projekt in der Region EU an. Ich spiele alle Migrationen ein und lege dort eine getrennte Demo-Einrichtung mit den Demo-Konten für die Prüfer an; sie ist per RLS von echten Kunden getrennt. Danach setzt du bei GitHub unter *Settings → Variables* `APP_SUPABASE_URL` und `APP_SUPABASE_ANON_KEY`.

In jedem Fall gilt: In Supabase unter **Authentication → URL Configuration → Redirect URLs** diese Einträge ergänzen: `pulshift://auth-callback`, `pulshift://auth-callback/**`, `capacitor://localhost`, `https://localhost`.

### 4. Push-Benachrichtigungen (optional für die erste Version)
Ohne Einrichtung zeigt die App unter Profil „Noch nicht eingerichtet“. Alles andere funktioniert trotzdem. Zum Einschalten: APNs-Schlüssel und Firebase-Projekt anlegen (`docs/APP-STORES.md` §6), dann die GitHub-Variable `APP_NATIVE_PUSH=true` setzen.

### 5. Name und Domain
Store-Suche und Markenregister (DPMA, EUIPO) auf „Pulshift“ prüfen. Die Domain `pulshift.app` sichern. Die App-ID `app.pulshift` lässt sich nach dem ersten Upload nicht mehr ändern.

## Einreichen – Schritt für Schritt

### Apple (App Store Connect)
1. App-ID `app.pulshift` mit Push Notifications registrieren, App in App Store Connect anlegen. Primärsprache: Deutsch. Details in `docs/RELEASE-OHNE-MAC.md` §2.
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
