# Sicherheitskonzept

## Grundsätze
1. **Deny by default:** RLS ist auf *jeder* Tabelle aktiv. `anon` hat keinerlei Rechte, und Funktionen sind für `public`/`anon` gesperrt.
2. **Least Privilege:** Tabellenrechte sind auf das Nötige reduziert, z. B. `UPDATE` nur für bestimmte Spalten. Statuswechsel laufen ausschließlich über geprüfte RPCs.
3. **Der Server entscheidet:** Mandant, Status, Autor, Speicherpfad und Zeitstempel setzt die Datenbank, nie der Client.
4. **Die UI-Prüfung ist nur Komfort:** `can()` im Frontend blendet nur Funktionen aus. Durchgesetzt wird jedes Recht in der Datenbank.

## Authentifizierung (Supabase Auth)
- E-Mail/Passwort, Google und Microsoft Entra ID (OAuth 2.0 mit **PKCE**)
- Passwort-Reset per E-Mail-Link. Die Antwort verrät nicht, ob ein Konto existiert.
- Passwortrichtlinie: mindestens 10 Zeichen, Groß- und Kleinbuchstaben sowie eine Ziffer, client- und serverseitig geprüft (`supabase/config.toml`).
- Passwortänderung erfordert das aktuelle Passwort (Re-Authentifizierung).
- Sessions: Access-Token 1 h, rotierende Refresh-Tokens mit Reuse-Erkennung, Inaktivitäts-Timeout 12 h, „Auf anderen Geräten abmelden“ (`signOut({ scope: 'others' })`).
- Keine Selbstregistrierung: Konten entstehen über Einladung (`invite-employee`).
- TOTP-MFA ist in der Konfiguration aktiviert; die UI dafür folgt (siehe OPEN_POINTS).
- Beim Abmelden wird der gesamte Query-Cache geleert, damit keine Daten an den nächsten Nutzer desselben Geräts gelangen.

## Autorisierung
Siehe [DATABASE.md → Berechtigungen](DATABASE.md#3-berechtigungen-statt-rollennamen). Zusätzlich gilt:
- **Separation of Duties:** Niemand kann eigene Anträge genehmigen oder eigene Krankmeldungen bestätigen.
- **Keine Rechteausweitung:** Rollen werden nur vergeben, wenn der Vergebende alle enthaltenen Rechte selbst hausweit besitzt.
- **Abwesenheiten:** Kollegen derselben Station sehen, *dass* und *wie lange* jemand krank ist (View `colleague_sick_leaves`), aber nie den Grund. Urlaube sehen nur die Person selbst und Berechtigte mit `leave.view`/`leave.approve`.
- **Kollegen sehen nur das sichere Verzeichnis** (`employee_directory`: Name, Foto, Beruf, Station, Qualifikationen, Sprachen). Kontaktdaten und Personalfelder sind nur mit `employees.view` im passenden Scope sichtbar.

## Verschlüsselung
- **Transport:** TLS (Supabase)
- **Ruhend:** Supabase verschlüsselt Datenträger und Backups (AES-256).
- **Spaltenebene für Gesundheitsdaten (Art. 9 DSGVO):** Der Kommentar einer Krankmeldung wird mit `pgp_sym_encrypt` (AES-256) verschlüsselt. Der Schlüssel liegt in **Supabase Vault** und wird bei der ersten Migration *in der Datenbank* erzeugt. Er steht nie im Repository und verlässt Vault nie.
  - Die Schlüsselfunktionen (`private.data_key/encrypt_text/decrypt_text`) sind für `authenticated` nicht ausführbar, sondern nur aus geprüften `SECURITY DEFINER`-RPCs.
  - Die Spalte `comment_encrypted` ist per Spaltenrecht nicht einmal lesbar.
  - Push- und Benachrichtigungs-Payloads enthalten **keine** Gesundheitsdaten.
- **Schlüsselrotation (Betrieb):** neuen Vault-Secret anlegen, `comment_encrypted` in einer Transaktion mit altem Schlüssel entschlüsseln und mit neuem verschlüsseln, alten Secret löschen. Ein Skript dafür ist offen (OPEN_POINTS).

## Audit-Log
- Der generische Trigger `private.audit_row()` protokolliert INSERT, UPDATE und DELETE auf allen sicherheits- und personalrelevanten Tabellen. Erfasst werden Akteur (`auth.uid()`), Rolle, geänderte Felder sowie alter und neuer Stand.
- Sensible Felder (verschlüsselte Kommentare, Push-Tokens) werden maskiert (`***`).
- Das Log ist append-only: Es gibt keine Insert-, Update- oder Delete-Rechte über die API. Lesen dürfen nur `audit.view` (Haus) und `platform.audit.view`.
- Anmeldeereignisse protokolliert Supabase Auth separat (`auth.audit_log_entries`).

## Dateien (Supabase Storage)
- Private Buckets: `documents` (PDF, DOCX, JPEG/PNG/WebP/HEIC, max. 20 MB) und `avatars` (max. 5 MB). MIME-Typen werden doppelt geprüft, vom Bucket und vom Tabellen-Check.
- Der Pfad `{hospital_id}/{document_id}/{file_name}` wird serverseitig festgelegt.
- Storage-Policies erlauben den Zugriff auf ein Objekt nur, wenn der Nutzer den zugehörigen `documents`-Datensatz per RLS sehen darf. Hochladen geht nur auf frisch angelegte eigene Metadaten. Avatare sind nur innerhalb gemeinsamer Häuser sichtbar.
- Clients bekommen ausschließlich zeitlich begrenzte signierte URLs.
- Profilbilder werden clientseitig verkleinert und neu kodiert. Dabei gehen auch EXIF- und GPS-Daten verloren.

## API-Zugriff
- Über die Data API ist nur das Schema `public` erreichbar. Die Helfer in `private` sind von außen nicht aufrufbar.
- Alle `SECURITY DEFINER`-Funktionen haben einen festen `search_path = ''` und voll qualifizierte Namen (Schutz vor Search-Path-Hijacking).
- Edge Functions: `invite-employee` prüft die Rechte mit dem JWT des Aufrufers. `push-dispatch` akzeptiert nur den Service-Role-Key.
- Der anon/publishable Key darf im Browser stehen. Der Service-Role-Key ist nur in Edge Functions und CI erlaubt.

## Checkliste für neue Tabellen
1. `hospital_id` + `UNIQUE (hospital_id, id)` + zusammengesetzte FKs
2. `ENABLE ROW LEVEL SECURITY` + Policies mit `IN (SELECT private.…)`
3. Tabellenrechte für `authenticated` minimal halten (Spaltengrants)
4. Audit-Trigger anhängen, falls personal- oder sicherheitsrelevant
5. RLS-Testfall in `supabase/tests` ergänzen
