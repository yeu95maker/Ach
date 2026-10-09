# Architektur

## Überblick

```
┌────────────────────────────── Client (Web · später iOS/Android via Capacitor) ─────────────────────────────┐
│  features/*  (Seiten, fachliche UI)                                                                        │
│     │ verwenden                                                                                            │
│  domain/*    (reine Logik & Typen: Kalender, Abwesenheiten, Rechte – keine Abhängigkeiten, Unit-getestet)  │
│     ▲ gemappt von                                                                                          │
│  data/*      (Repositories: einziger Ort mit Supabase-Aufrufen, Row → Domäne, Fehler → AppError)           │
│  core/*      (Konfiguration, Supabase-Client, i18n, Theme, Formatierung, Fehler)   ui/* (Designsystem)     │
└───────────────────────────────────────────────┬────────────────────────────────────────────────────────────┘
                                                │ HTTPS (PostgREST, Auth, Storage) · WebSocket (Realtime)
┌───────────────────────────────────────────────▼──────────────── Supabase ──────────────────────────────────┐
│ Auth (E-Mail, Google, Microsoft, PKCE)   Storage (private Buckets)   Realtime   Edge Functions              │
│ PostgreSQL: public (Tabellen, Views, RPCs) · private (Rechte-Helfer, Trigger) · RLS auf jeder Tabelle       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Clean-Architecture-Regeln**
- `domain` importiert nichts aus anderen Schichten.
- `data` importiert `domain` und `core`. Nur hier wird Supabase verwendet. Ein Backendwechsel bliebe auf diese Schicht beschränkt.
- `features` nutzen Repositories über TanStack-Query-Hooks und rufen Supabase nie direkt auf.
- `ui` ist fachfrei, `components` enthält fachliche, wiederverwendbare Bausteine.
- Die **Geschäftsregeln mit Sicherheitsrelevanz** (Wer darf was? Welche Statusübergänge?) liegen in der Datenbank. Sie gelten damit für Web, Mobile, Integrationen und Admin-Tools gleichermaßen.

## Datenfluss
- **Start:** `SessionProvider` (Supabase-Session) → `TenantProvider` lädt `my_context()` (ein Aufruf) → aktive Anstellung, Rechte, Sprache und Theme des Profils.
- **Lesen:** Query-Hooks mit zentralen Query-Keys (`features/queryKeys.ts`), Stale-While-Revalidate, Refetch bei Fokus.
- **Schreiben:** Mutations → Repository/RPC → gezielte Invalidierung → Toast.
- **Live:** `useRealtimeNotifications` abonniert neue Benachrichtigungen, invalidiert die betroffenen Caches (Dienstplan, Anträge, Dashboard) und zeigt Toast bzw. Systembenachrichtigung.
- **Deep Links:** Ansicht und Datum des Dienstplans stehen in der URL (`/schedule?view=day&date=…`). Benachrichtigungen öffnen direkt den richtigen Tag.

## Navigation (≤ 3 Klicks)

| Hauptpunkt | Inhalt |
| --- | --- |
| Home | Begrüßung, heutiger und nächster Dienst, Schnellaktionen, Leitungs-Aufgaben, Mitteilungen, eigene Anträge, offene Dienste, Aktuelles |
| Dienstplan | Monat / Woche / Tag, Detail mit Kollegen im Dienst; für Leitungen „Dienstpläne verwalten“ |
| Mitteilungen | Benachrichtigungen, Push aktivieren |
| Team | Im Dienst, Kollegen; für Leitungen Urlaubsanträge und Krankmeldungen |
| Profil | Profil, Kontakt, Sprachen, App-Sprache, Darstellung, Push, Passwort, Sitzungen, Meine Anträge |

Krankmeldung und Urlaubsantrag sind vom Home aus mit **einem** Klick erreichbar, auf dem Desktop zusätzlich dauerhaft in der Seitenleiste. Auch eine Genehmigung braucht nur zwei Klicks: Home → Leitungs-Karte → Genehmigen.

## Auth-Flows
- Login mit Passwort oder OAuth (Google, `azure`), PKCE, Rückkehr auf `/`
- Passwort vergessen → E-Mail → `/reset-password` (Event `PASSWORD_RECOVERY`) → neues Passwort
- Session-Speicher hinter der Schnittstelle `AuthStorage` (`src/core/authStorage.ts`)

### Biometrischer Login (vorbereitet)
Auf Mobilgeräten wird `setAuthStorage()` vor dem ersten Supabase-Aufruf mit einem Adapter belegt, der den Refresh-Token im **iOS Keychain / Android Keystore** speichert, z. B. mit `@capacitor-community/secure-storage` oder `capacitor-native-biometric`. `getItem` wird hinter Face ID, Touch ID oder Fingerabdruck geschaltet. Die übrige App ändert sich dafür nicht.

## Push-Benachrichtigungen
1. Ein Fachereignis löst einen DB-Trigger aus, der `notifications` befüllt. Ein Statement-Trigger legt daraus `notification_deliveries` pro Gerät an.
2. **Web:** Der Service Worker `public/sw.js` erhält eine Web-Push-Subscription (VAPID, `VITE_VAPID_PUBLIC_KEY`) und registriert sie über `register_device_token`.
3. Die Edge Function `push-dispatch` (Cron oder DB-Webhook) versendet die Nachrichten, wiederholt fehlgeschlagene Zustellungen und entfernt abgelaufene Subscriptions.
4. **Ohne VAPID** funktionieren In-App-Live-Benachrichtigungen (Realtime) und Systembenachrichtigungen bei geöffneter App trotzdem.
5. **iOS/Android:** Der Capacitor-Push-Plugin registriert APNs- bzw. FCM-Tokens mit `platform = 'ios' | 'android'` über dasselbe RPC. Den Versand ergänzt man in `push-dispatch`.

## Mobile (iOS & Android)
Die App ist eine responsive SPA ohne Server-Rendering. Sie lässt sich daher unverändert mit **Capacitor** verpacken (`npx cap add ios android`, `webDir: dist`). Für Mobile sind vorbereitet:
- Safe-Area-Insets (Notch, Home-Indicator) in Shell und Sheets
- große Touch-Ziele (≥ 44 pt), Bottom-Tab-Bar, Bottom-Sheets
- OAuth-Redirect-URLs für `capacitor://localhost` und `shiftcare://auth-callback` in `supabase/config.toml`
- austauschbarer Session-Speicher (Biometrie) und plattformneutrale Device-Tokens

## Edge Functions
| Funktion | Zweck | Auth |
| --- | --- | --- |
| `invite-employee` | HR lädt Mitarbeitende ein: Konto, Anstellung, Station und Rolle mit Rechte-Teilmengenprüfung | JWT des Aufrufers |
| `push-dispatch` | arbeitet die Push-Queue ab | Service Role |

## Lokale Entwicklung & Tests
Siehe [README](../README.md#qualitätssicherung).
