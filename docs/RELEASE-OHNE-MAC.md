# App-Release nur mit dem iPad

Du brauchst **keinen Mac und keinen PC**. Gebaut, signiert und hochgeladen wird auf den Rechnern von GitHub (Workflow `Store release`). Alles andere erledigst du in **Safari** auf dem iPad.

Tipp: Manche Einstellungsseiten von GitHub und Apple sind in der mobilen Ansicht versteckt. In Safari oben links auf **„aA“ → „Desktop-Website anfordern“** tippen.

## Überblick

| Schritt | Wo | Dauer |
| --- | --- | --- |
| 1. Apple Developer Program beitreten | developer.apple.com | 1–2 Tage Prüfung durch Apple |
| 2. App-ID registrieren und App anlegen | developer.apple.com, appstoreconnect.apple.com | 10 Min. |
| 3. API-Schlüssel erzeugen und bei GitHub hinterlegen | App Store Connect, GitHub | 10 Min. |
| 4. iOS-Build starten → TestFlight → auf dem iPad testen | GitHub Actions, TestFlight-App | 20–40 Min. |
| 5. Android: Google-Play-Konto, Upload-Schlüssel erzeugen lassen | play.google.com/console, GitHub | 15 Min. + Prüfung durch Google |
| 6. Android-Build starten und in der Play Console hochladen | GitHub Actions, Play Console | 15 Min. |

**Vorher entscheiden** (siehe [APP-STORES.md](APP-STORES.md#2-vor-dem-ersten-upload--bitte-zuerst-klären)): App-Name „Dienstwerk“ und App-ID `app.dienstwerk` sind festgelegt. Wenn du doch eine andere ID willst (z. B. `de.deinefirma.dienstwerk`), sag sie mir **vor** Schritt 2, dann stelle ich sie überall um. Nach dem ersten Upload ist sie nicht mehr änderbar.

## 1. Apple Developer Program

1. https://developer.apple.com/programs/enroll öffnen und mit deiner Apple-ID anmelden.
2. Als **Einzelperson** oder **Organisation** beitreten. Für eine Organisation brauchst du eine D-U-N-S-Nummer, die Apple dir kostenlos vermittelt.
3. 99 USD pro Jahr bezahlen und auf die Freischaltung warten (E-Mail von Apple).

## 2. App-ID registrieren und App anlegen

1. https://developer.apple.com/account/resources/identifiers/list → **„+“** → *App IDs* → *App* → Weiter.
2. *Description*: `Dienstwerk`, *Bundle ID*: **Explicit** `app.dienstwerk` (oder deine eigene).
3. Unter *Capabilities* **Push Notifications** anhaken → *Continue* → *Register*.
4. https://appstoreconnect.apple.com → **Apps** → **„+“** → *Neue App*:
   - Plattform **iOS**, Name z. B. „Dienstwerk – Dienstplan Pflege“, Primärsprache **Deutsch**
   - Bundle-ID: die eben registrierte auswählen, SKU: `dienstwerk`
5. Deine **Team-ID** findest du unter https://developer.apple.com/account → *Membership details* (10 Zeichen, z. B. `A1B2C3D4E5`).

## 3. API-Schlüssel für GitHub

1. App Store Connect → **Benutzer und Zugriff** → Reiter **Integrationen** → *App Store Connect API* → **Team-Schlüssel** → **„+“**.
2. Name `GitHub`, Zugriff **Admin**. Admin ist nötig, damit Xcode die Zertifikate und Profile selbst anlegen darf.
3. **Generieren** → bei dem neuen Schlüssel **„API-Schlüssel herunterladen“**. Das geht **nur einmal**, die Datei `AuthKey_XXXXXXXXXX.p8` landet in der Dateien-App.
4. Notiere die **Schlüssel-ID** (in der Liste) und die **Issuer-ID** (oben auf der Seite).
5. Den Inhalt der `.p8`-Datei kopieren: In der **Dateien-App** lange auf die Datei tippen → *Umbenennen* → Endung in `.txt` ändern → öffnen → *Alles auswählen* → *Kopieren*.
6. GitHub → https://github.com/yeu95maker/Ach/settings/secrets/actions → **New repository secret**, vier Mal:

| Name | Wert |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | Schlüssel-ID |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer-ID |
| `APP_STORE_CONNECT_KEY` | kompletter Inhalt der `.p8`-Datei, inkl. `-----BEGIN PRIVATE KEY-----` und `-----END PRIVATE KEY-----` |
| `APPLE_TEAM_ID` | Team-ID |

7. Die `.p8`-Datei danach an einem sicheren Ort aufbewahren (z. B. Passwort-Manager) und aus *Downloads* löschen.

## 4. iOS-App bauen und auf dem iPad testen

1. GitHub → **Actions** → links **„Store release“** → **Run workflow** → Plattform `ios`, Version `1.0.0` → **Run workflow**.
2. Nach etwa 15 Minuten ist der Lauf grün. App Store Connect braucht danach noch 10–30 Minuten zur Verarbeitung.
3. App Store Connect → deine App → **TestFlight** → *Interne Tests* → Gruppe anlegen → dich selbst hinzufügen.
4. Die App **TestFlight** aus dem App Store auf dem iPad installieren, mit derselben Apple-ID anmelden → Dienstwerk installieren.
5. Testen nach der Checkliste in [APP-STORES.md §8](APP-STORES.md#8-test-auf-echten-geräten-vor-der-einreichung).

Jeder weitere Lauf erhöht die Build-Nummer automatisch. Für ein Update im Store erhöhst du nur die Version (z. B. `1.0.1`).

## 5. Android: Konto und Upload-Schlüssel

1. https://play.google.com/console → Konto anlegen (25 USD einmalig), Identität bestätigen.
2. Den Upload-Schlüssel erzeugt GitHub für dich. Dafür braucht der Workflow einmalig die Erlaubnis, Secrets zu setzen:
   - https://github.com/settings/personal-access-tokens/new
   - *Token name*: `Dienstwerk Schlüssel`, *Expiration*: 7 Tage
   - *Repository access*: **Only select repositories** → `yeu95maker/Ach`
   - *Permissions* → *Repository permissions* → **Secrets: Read and write**
   - **Generate token** → Token kopieren
   - Als Repository-Secret `GH_SECRETS_TOKEN` speichern (wie in Schritt 3.6)
3. Actions → **„Android-Upload-Schlüssel erzeugen“** → **Run workflow**. Danach gibt es die Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` und `ANDROID_KEY_ALIAS`. Der Schlüssel erscheint nirgends im Klartext.
4. Danach den Token wieder löschen (https://github.com/settings/personal-access-tokens) und das Secret `GH_SECRETS_TOKEN` entfernen.

Wichtig: In der Play Console **Play App Signing** aktiviert lassen (Standard). Dann signiert Google die App für die Nutzer, und ein verlorener Upload-Schlüssel kann über den Google-Support ersetzt werden.

## 6. Android-App bauen und hochladen

1. Actions → **„Store release“** → Plattform `android`, Version `1.0.0`.
2. Wenn der Lauf grün ist: unten bei **Artifacts** die Datei herunterladen. Die Dateien-App entpackt das ZIP beim Antippen; darin liegt `Dienstwerk-1.0.0-<nr>.aab`.
3. Play Console → **App erstellen** (Name, Standardsprache Deutsch, App, kostenlos) → **Testen → Interner Test → Neuen Release erstellen** → AAB hochladen → Release-Name übernehmen → speichern und überprüfen.
4. Dich selbst als Tester eintragen und die App über den Testlink auf einem Android-Gerät installieren.

Optional: Für automatische Uploads in den internen Test ein Google-Cloud-Dienstkonto mit Zugriff in der Play Console anlegen und dessen JSON als Secret `PLAY_SERVICE_ACCOUNT_JSON` speichern. Den **ersten** Upload verlangt Google immer per Hand.

## Wenn etwas schiefgeht

| Meldung im Lauf | Ursache und Lösung |
| --- | --- |
| „Es fehlen GitHub-Secrets“ | Schritt 3.6 prüfen, Namen exakt so schreiben |
| `No profiles for 'app.dienstwerk' were found` / `Cloud signing permission error` | Der API-Schlüssel hat nicht die Rolle **Admin** (Schritt 3.2) |
| `No suitable application records were found` | Die App fehlt in App Store Connect oder hat eine andere Bundle-ID (Schritt 2.4) |
| `The bundle version must be higher` | Der Build wurde schon einmal hochgeladen. Lauf einfach neu starten, die Nummer steigt automatisch |
| Android: „Es fehlt der Android-Upload-Schlüssel“ | Schritt 5 ausführen |
| Play Console: „Paketname bereits verwendet“ | Die App-ID ist vergeben, eine eigene wählen (siehe oben) |

Was hier **nicht** geprüft werden konnte: Signieren und Hochladen laufen erst, wenn deine Apple- und Google-Konten existieren. Bauen ohne Signatur ist geprüft (Workflow „Mobile apps“, grün).
