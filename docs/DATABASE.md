# Datenbank-Architektur

PostgreSQL (Supabase), normalisiert, mandantenfähig, abgesichert durch Row Level Security. Alle Änderungen erfolgen über versionierte Migrationen in `supabase/migrations`.

| Migration | Inhalt |
| --- | --- |
| `0100_foundation` | Extensions (`pgcrypto`, `btree_gist`), Schema `private`, Enum-Typen, `updated_at`-Trigger |
| `0200_tenancy` | `languages`, `hospitals`, `departments`, `units` |
| `0300_identity` | `users`, `employees`, `employee_units`, `user_languages`, `qualifications`, `employee_qualifications` |
| `0400_rbac` | `permissions`, `roles`, `role_permissions`, `employee_roles`, `platform_role_assignments`, Berechtigungs-Helfer |
| `0500_scheduling` | `shift_types`, `schedules`, `schedule_entries` |
| `0600_absences` | `leave_requests`, `sick_leaves` |
| `0700_communication` | `notifications`, `device_tokens`, `notification_deliveries`, `announcements` |
| `0800_documents` | `documents`, Storage-Buckets `documents` und `avatars` |
| `0900_settings_audit` | `settings`, `audit_logs` + generischer Audit-Trigger |
| `1000_rls` | Rechte-Baseline, RLS-Policies für alle Tabellen und Storage |
| `1100_api` | Spaltenverschlüsselung, Views, Workflow-RPCs |
| `1200_notification_triggers` | Fachereignisse → Benachrichtigungen → Push-Queue, Realtime |

## Entitäten

```
hospitals ─┬─ departments ── units ─────────────┐
           │                                      │
auth.users ── users ──< employees >──────────────┤ employee_units
           │              │  │                    │
           │              │  └──< employee_roles >── roles ──< role_permissions >── permissions
           │              │
           │              ├──< schedule_entries >── schedules (pro Station & Zeitraum)
           │              │          └── shift_types
           │              ├──< leave_requests
           │              ├──< sick_leaves (Kommentar verschlüsselt)
           │              ├──< employee_qualifications >── qualifications
           │              └──< documents ── storage.objects
           │
           ├──< user_languages >── languages
           ├──< notifications ──< notification_deliveries >── device_tokens
           ├── announcements
           ├── settings
           └── audit_logs
```

### Abbildung der geforderten Tabellen

| Gefordert | Umsetzung |
| --- | --- |
| Hospitals | `hospitals` (Mandant) |
| Departments | `departments` |
| Units / Wards | `units` |
| Users | `users` (Profil, 1:1 zu `auth.users`) |
| Roles | `roles`, `role_permissions`, `permissions`, `employee_roles`, `platform_role_assignments` |
| Employees | `employees`, `employee_units` |
| Schedules | `schedules` |
| Schedule Entries | `schedule_entries` (+ `shift_types`) |
| Leave Requests | `leave_requests` |
| Sick Leave | `sick_leaves` |
| Notifications | `notifications`, `notification_deliveries`, `device_tokens` |
| Announcements | `announcements` |
| Documents | `documents` + Storage-Bucket `documents` |
| Employee Qualifications | `qualifications`, `employee_qualifications` |
| Languages | `languages`, `user_languages` |
| Audit Logs | `audit_logs` |
| Settings | `settings` |

## Zentrale Designentscheidungen

### 1. Person ≠ Anstellung (`users` vs. `employees`)
Eine Person (Login, Name, Foto, Sprachen) kann in mehreren Häusern angestellt sein, etwa Springer- oder Leasingkräfte. Persönliche Daten liegen deshalb einmal in `users`. Alle fachlichen Daten (Dienste, Urlaub, Rollen) hängen an `employees`, also an der Anstellung in genau **einem** Krankenhaus. Jedes Haus sieht nur seine eigene Anstellung.

### 2. Mandantentrennung auf drei Ebenen
1. **Spalte:** Jede mandantenbezogene Tabelle trägt `hospital_id`. Bei Tabellen ohne eigene Spalte (`role_permissions`, `user_languages`) ergibt sich die Zuordnung eindeutig aus dem Elternobjekt.
2. **Referenzielle Integrität:** Jede Tabelle hat `UNIQUE (hospital_id, id)`. Kinder referenzieren über den **zusammengesetzten** Schlüssel `(hospital_id, parent_id)`. Damit ist es selbst mit Service-Role technisch unmöglich, eine Station von Haus A einem Mitarbeiter von Haus B zuzuordnen (getestet).
3. **RLS:** Jede Policy leitet die erlaubten `hospital_id`s aus den *eigenen aktiven Anstellungen* ab, nie aus Client-Angaben.

Bewusst **kein** Tenant-Claim im JWT: Rechteänderungen (Rolle entzogen, Anstellung beendet) wirken sofort und nicht erst nach Token-Ablauf. Die Helfer werden pro Statement nur einmal ausgewertet (siehe Performance).

### 3. Berechtigungen statt Rollennamen
- `permissions` ist der Katalog der Fähigkeiten (`leave.approve`, `schedule.publish` …).
- `roles` bündeln Berechtigungen. Systemrollen haben `hospital_id = NULL` und gelten für alle Häuser. Häuser können eigene Rollen anlegen.
- `employee_roles` weist eine Rolle zu, optional **eingeschränkt** auf eine Abteilung oder eine Station. Ohne Einschränkung gilt sie für das ganze Haus.
- RLS, RPCs und UI prüfen ausschließlich Berechtigungen. Eine neue Rolle braucht daher keinen Code.
- **Rechteausweitung ist ausgeschlossen:** Man kann nur Rollen vergeben bzw. Rollen mit Berechtigungen füllen, die man selbst hausweit besitzt (`private.can_grant_role`).

| Rolle (Key) | Deutsch | Wesentliche Rechte | Typischer Scope |
| --- | --- | --- | --- |
| `nurse` | Pflegekraft | eigener Dienstplan, Kollegen, Urlaub/Krank melden | Haus |
| `charge_nurse` | Stationsleitung | + Entwürfe sehen, Dienstplan bearbeiten/veröffentlichen, Urlaub genehmigen, Krankmeldungen inkl. Kommentar, Mitarbeiterübersicht, Mitteilungen | Station |
| `head_nurse` | Pflegedienstleitung | wie Stationsleitung + Qualifikationen, Dokumente | Abteilung / Haus |
| `hr` | Personalabteilung | Mitarbeiter verwalten, Rollen vergeben, Urlaub/Krankzeiträume sehen (**ohne** medizinischen Kommentar, **ohne** Genehmigung) | Haus |
| `hospital_admin` | Krankenhaus-Administration | Organisation, Einstellungen, Rollen, Audit-Log (**ohne** Gesundheitsdaten) | Haus |
| `system_admin` | Plattformbetrieb | Mandanten verwalten, Plattform-Audit (**keine** Personal- oder Gesundheitsdaten) | Plattform |

### 4. Dienstplan
- `shift_types`: konfigurierbare Schichtvorlagen (Früh/Spät/Nacht …) mit Kategorie für die Farbcodierung. Nachtdienste enden am Folgetag, wenn `end_time <= start_time`.
- `schedules`: ein Plan pro Station und Zeitraum mit Lebenszyklus `draft → published → archived` und Versionszähler. Eine Exclusion-Constraint verhindert überlappende aktive Pläne pro Station.
- `schedule_entries`: Dienst, freier Tag oder **offener Dienst** (`employee_id IS NULL`). `starts_at`/`ends_at` werden per Trigger aus Schichttyp und Datum in der **Zeitzone des Krankenhauses** berechnet. Das ist bewusst denormalisiert: Abfragen wie „Wer ist gerade im Dienst?“ werden dadurch zu einer einfachen Bereichssuche über einen Index, und einzelne Dienste können zeitlich abweichen.
- **Doppelbuchungen sind unmöglich:** Eine GiST-Exclusion-Constraint verhindert überlappende Dienste derselben Person.
- **Urlaub und Krankheit stehen nicht im Dienstplan.** Sie leben ausschließlich in `leave_requests`/`sick_leaves` und werden im Kalender überlagert. So gibt es nur eine Quelle der Wahrheit für Abwesenheiten.

### 5. Workflows über RPCs
Clients dürfen nur einfache Self-Service-Inserts direkt ausführen, z. B. einen eigenen Urlaubsantrag. Dabei setzen Trigger die Serverfelder (`hospital_id`, `status`), und Spaltenrechte verhindern das Setzen von `status`. **Jede Statusänderung** läuft über `SECURITY DEFINER`-Funktionen mit expliziter Rechteprüfung:

| RPC | Zweck |
| --- | --- |
| `my_context()` | Profil, Anstellungen, Stationen, Rollen, effektive Rechte in **einem** Aufruf |
| `get_dashboard(employee_id)` | komplette Startseite in **einem** Aufruf (Security Invoker → RLS gilt) |
| `publish_schedule(id)` | veröffentlichen / neu veröffentlichen (Version +1) |
| `decide_leave_request(id, approve, note)` | genehmigen/ablehnen, **keine Selbstgenehmigung** |
| `cancel_leave_request(id)` | eigenen offenen Antrag zurückziehen |
| `report_sick_leave(…)` | Krankmeldung, Kommentar wird serverseitig verschlüsselt |
| `acknowledge_sick_leave(id)` | Kenntnisnahme durch die Leitung |
| `get_sick_leave_comment(id)` | entschlüsselt nur für Betroffene und `sick_leave.view_details` |
| `mark_notifications_read(ids)` | gelesen markieren |
| `register_device_token(…)` | Push-Endpunkt registrieren (Web, iOS, Android) |

### 6. Benachrichtigungen
- Trigger erzeugen Benachrichtigungen **in derselben Transaktion** wie das Fachereignis: Plan veröffentlicht, Dienst geändert, offener Dienst, Urlaub beantragt/genehmigt/abgelehnt, Krankmeldung gemeldet/bearbeitet, Mitteilung veröffentlicht. Es gehen keine Ereignisse verloren, und der Client muss nichts tun. Wer das Ereignis selbst auslöst, wird nicht benachrichtigt.
- Gespeichert werden **Typ + Payload**, kein fertiger Text. Die App rendert in der Sprache des Empfängers, deshalb müssen gespeicherte Daten nie übersetzt werden.
- Ein Statement-Level-Trigger legt je Gerät eine Zustellung in `notification_deliveries` an (Queue). Die Edge Function `push-dispatch` arbeitet sie ab. Nutzer können Push pro Haus abschalten (`settings.notifications.push`).
- Supabase Realtime liefert neue Benachrichtigungen live in die App (RLS gilt auch hier).

### 7. Lokalisierung
- `languages` ist der Katalog: UI-Sprachen (`is_ui_available`) und gesprochene Sprachen für Profile.
- Die UI-Texte liegen in `src/locales/<code>.json`, Nicht-Standardsprachen werden nachgeladen.
- **Neue Sprache:** JSON-Datei hinzufügen, in `src/core/i18n.ts` eintragen und `is_ui_available = true` setzen. `scripts/check-i18n.mjs` prüft die Vollständigkeit.

### 8. Einstellungen
`settings` ist ein typisierter Key/Value-Speicher (`jsonb`). `user_id IS NULL` steht für eine Hauseinstellung, sonst für eine Nutzereinstellung im Haus. Es gibt nur einen Eintrag pro (Haus, Nutzer, Schlüssel). Neue Einstellungen brauchen keine Migration.

## Performance

- **Policies werten Helfer nur einmal pro Statement aus:** Sie sind als `col IN (SELECT private.fn())` formuliert. PostgreSQL führt die Funktion so einmal aus (InitPlan / hashed SubPlan) und nicht pro Zeile. `auth.uid()` wird immer als `(select auth.uid())` gekapselt.
- **Indizes** entlang aller RLS- und Zugriffspfade: `employees(user_id)`, `employee_units(unit_id)`, `schedule_entries(employee_id, entry_date)`, `(schedule_id, entry_date)`, `(hospital_id, starts_at, ends_at)`. Dazu kommen Partial-Indizes für offene Dienste, offene Anträge, ungelesene Benachrichtigungen und die Push-Queue sowie GiST-Indizes aus den Exclusion-Constraints.
- **Wenige Roundtrips:** `my_context` und `get_dashboard` bündeln die häufigsten Abfragen. Avatar-URLs werden gebündelt signiert und gecacht.
- **Fan-out** (z. B. Mitteilung an ein ganzes Haus) läuft mengenbasiert per `INSERT … SELECT`, Push-Zustellungen per Statement-Trigger mit Transition Table.
- **Ausbaupfad bei Wachstum:** `audit_logs` und `notifications` nach Monat partitionieren, große Fan-outs über `pgmq` entkoppeln, Read-Replicas für Reporting. Alles lässt sich ohne Schemaänderung der Kernmodelle nachziehen.

## Tests

`npm run test:db` legt eine frische Datenbank an, spielt alle Migrationen und den Seed ein und führt `supabase/tests/*.test.sql` aus. Jeder Testblock simuliert einen Nutzer genau wie PostgREST (Rolle `authenticated` plus JWT-Claims). Geprüft werden u. a.:
- anonymer Zugriff wird abgewiesen
- Pflegekraft sieht nur ihr Haus und nur ihre Personaldaten; Kollegen sieht sie nur über das sichere Verzeichnis
- Stationsleitung genehmigt, bestätigt und veröffentlicht nur auf **ihrer** Station
- keine Selbstgenehmigung, keine Rechteausweitung durch HR
- HR sieht Krankzeiträume, aber keine Kommentare
- der Systemadmin sieht Mandanten, aber keine Personal- oder Gesundheitsdaten
- Storage: Dateien sind nur über berechtigte Metadaten erreichbar
- Integrität: keine Doppelbuchung, keine mandantenübergreifenden Referenzen, keine überlappenden Anträge
