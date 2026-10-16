# Sicherheits-Check vor der Einreichung

Stand: 16.10.2026. Geprüft am Code, an der Git-Historie und am Demo-Projekt (Supabase Security Advisor).

| Punkt | Stand | Wie / Nachweis |
| --- | --- | --- |
| Ungenutzte Pakete | ✅ | `npx depcheck`: keine ungenutzten Pakete. `@fontsource-variable/inter` wird per CSS-`@import` genutzt. |
| Geheimnisse in Git | ✅ | Die gesamte Historie ist durchsucht. Gefunden wurde nur der öffentliche `anon`-Schlüssel des Demo-Projekts. Kein `service_role`, kein privater Schlüssel, keine `.env`. Keystores, `.p8` und `google-services.json` stehen in `.gitignore`. |
| Rate Limiting | ✅ | Supabase Auth: 30 Anmeldungen und 30 Token-Prüfungen pro 5 Min. und IP, 10 E-Mails pro Stunde (`supabase/config.toml`; im gehosteten Projekt unter *Authentication → Rate Limits*). Schnittstelle: höchstens 120 Lieferungen pro Stunde und Profil (HTTP 429). Chat, Diensttausch und Dokumente haben eigene Limits in der Datenbank (`P0429`). |
| Zugriff je Nutzer | ✅ | RLS auf **allen** Tabellen. Schreiben läuft nur über geprüfte RPCs mit Rechteprüfung pro Einrichtung und Station. 12 SQL-Testsuites prüfen die Trennung der Einrichtungen. |
| Passwörter gehasht | ✅ | Supabase Auth (bcrypt). Mindestens 10 Zeichen, Groß- und Kleinbuchstaben sowie Ziffern. Ein Passwortwechsel verlangt eine frische Anmeldung. Schnittstellen-Schlüssel werden nur als SHA-256 gespeichert und sind nie wieder lesbar. |
| API-Schlüssel versteckt | ✅ | Im Frontend steht nur die öffentliche Projekt-URL und der `anon`-Schlüssel (dafür gedacht, durch RLS geschützt). `service_role` und Push-Schlüssel liegen nur als Secrets in den Edge Functions bzw. in GitHub Secrets. |
| Authentifizierung | ✅ | Supabase Auth. Registrierung ist gesperrt, es gibt nur Einladungen. Sitzungen enden nach 12 h Inaktivität. In der App liegen die Sitzungsdaten im Schlüsselbund (iOS) bzw. Keystore (Android). |
| Abhängigkeiten aktuell | ✅ | `npm audit`: 0 Schwachstellen. Updates innerhalb der Versionsbereiche eingespielt. Major-Sprünge (React Router 8, TypeScript 7) bewusst nicht vor der Einreichung. |
| Formulare geprüft | ✅ | Der Client prüft Pflichtfelder, Datumsbereiche und Längen. Entscheidend ist der Server: Längen- und Formatprüfungen als `check`-Constraints und in den RPCs. |
| Schutz vor XSS | ✅ | React escaped alle Ausgaben. Es gibt kein `dangerouslySetInnerHTML`, kein `innerHTML` und kein `eval`. Zusätzlich gilt eine Content-Security-Policy (siehe unten). |
| Debug-Modus | ✅ | Keine `console.log`/`debugger` im App-Code. **Neu:** Source Maps werden nicht mehr ausgeliefert (`vite.config.ts`). |
| Umgebungsvariablen | ✅ | `.env` steht in `.gitignore`. `.env.example` enthält nur Platzhalter. |
| Offene Dateien | ✅ | Ausgeliefert werden nur `dist/` (App, Datenschutz, Support). Storage-Buckets sind privat, Dateien gibt es nur über kurzlebige signierte Links. |
| Admin-Bereiche geschützt | ✅ | Die Routen sind im Client ausgeblendet. Entscheidend ist der Server: Jede Admin-RPC prüft die Berechtigung (`employees.manage`, `roles.assign` …). |
| API-Endpunkte gesichert | ✅ | Gäste (`anon`) dürfen keine einzige Funktion aufrufen. `push-dispatch` nur mit Service-Schlüssel, `invite-employee` nur mit gültiger Anmeldung und Recht, `roster-sync` nur mit Schnittstellen-Schlüssel. |
| CORS | ✅ | Die Edge Functions erlauben jeden Ursprung, aber nur `POST`. Der Zugriff hängt immer am Schlüssel bzw. Token, nie an Cookies, daher ist das unkritisch. Die Datenbank-API (PostgREST) regelt Supabase. |
| Sicherheits-Header | ✅ | **Neu:** Content-Security-Policy als `<meta>` in jedem Produktions-Build. Nur die App selbst und das eigene Supabase-Projekt dürfen kontaktiert werden, Inline-Skripte nur per Hash. Dazu kommt eine Referrer-Policy. Datenschutz- und Support-Seite haben eine eigene, strengere CSP. Header wie HSTS setzt GitHub Pages bzw. Supabase. |
| Datenbankzugriff | ✅ | Alle `SECURITY DEFINER`-Funktionen mit festem `search_path`. Hilfsfunktionen liegen im nicht öffentlichen Schema `private`. Krankmeldungs-Kommentare sind auf Spaltenebene verschlüsselt. |

## Hinweise des Supabase Security Advisors (Demo-Projekt)

- **„Security Definer View“** (`employee_directory`, `colleague_sick_leaves`): gewollt. Beide Views filtern selbst nach Einrichtung und Station (`private.hospitals_with_any_permission`, `private.my_unit_ids`) und zeigen nur unkritische Spalten.
- **„Signed-in users can execute SECURITY DEFINER function“** (66×): gewollt. Das sind die RPCs, über die geschrieben wird. Jede prüft selbst die Berechtigung.
- **„RLS enabled, no policy“** (`notification_deliveries`, `training_reminders`): gewollt, nur intern genutzt.
- **„Leaked password protection disabled“**: im Supabase-Dashboard unter *Authentication → Providers → Email* einschalten. Das geht nur im Pro-Tarif; für ein Produktions-Projekt empfohlen.

## Prüfen

```sh
npm run -s check                      # Typen, Lint, Unit-Tests, i18n, Store
PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./scripts/db-test.sh
npm audit && npx depcheck
APP_URL=http://localhost:4173 node scripts/e2e/smoke.mjs   # gegen `vite preview`: meldet auch CSP-Verstöße
```
