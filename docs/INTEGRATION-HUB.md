# ShiftCare Integration Hub

Stand: 10.10.2026.

Die Einrichtungen behalten ihr bisheriges Dienstplanprogramm. Die Stationsleitung überträgt den fertigen Plan nach ShiftCare. ShiftCare liest ihn ein, ordnet ihn zu, prüft ihn, zeigt die Änderungen und veröffentlicht ihn nach ausdrücklicher Freigabe an die richtigen Mitarbeitenden.

## Was heute funktioniert und was nicht

| Importweg | Status |
| --- | --- |
| **CSV-Datei** (UTF-8 mit/ohne BOM, Windows-1252; Trennzeichen `;` `,` Tab `\|`) | ✅ umgesetzt und getestet |
| **Excel-Datei (XLSX)** (getestet mit Dateien aus openpyxl und LibreOffice) | ✅ umgesetzt und getestet |
| Aufbau **Liste** (eine Zeile pro Dienst) | ✅ |
| Aufbau **Raster** (eine Zeile pro Person, eine Spalte pro Tag) | ✅ |
| Altes Excel-Format `.xls`, ODS, PDF | ❌ nicht unterstützt: bitte als XLSX oder CSV exportieren |
| **Direkte Schnittstelle (API)** zu einem Anbieter | ❌ **nicht umgesetzt.** Es gibt kein einziges Herstellersystem, das ShiftCare heute direkt anbindet. |
| **Automatischer Dateiabruf** (z. B. SFTP) | ❌ nicht umgesetzt |
| Zugangsdaten für künftige Schnittstellen sicher hinterlegen (Vault) | ✅ umgesetzt (nur Speicherung, kein Abruf) |

In der Oberfläche heißen die Arten „Direkte Schnittstelle (in Vorbereitung)“ und „Automatischer Dateiabruf (in Vorbereitung)“. Solche Profile lassen sich zwar anlegen, aber nicht zum Import verwenden. Die Datenbank lehnt das ab.

**Definition of Done erfüllt:**
- Eine CSV- oder XLSX-Datei wird eingelesen und geprüft.
- Die Dienste werden über die Personalnummer oder eine bestätigte ID einer Person zugeordnet.
- Nach der Freigabe sieht die Person ihre Dienste in ihrem Konto, auch mobil mit Monats-, Wochen- und Tagesansicht und „Stand“.

Geprüft wird das automatisiert: in `supabase/tests/06_integration.test.sql` und im Ende-zu-Ende-Test `scripts/e2e/smoke.mjs` (Abschnitt „Integration Hub“).

## Ablauf für die Stationsleitung (`Dienstplan → Dienstplan importieren`)

1. **Datei:** Station, Monat und Importprofil wählen, dann die Datei hochladen. Die Datei wird **nur im Browser** gelesen.
2. **Spalten:**
   - ShiftCare schlägt die Zuordnung vor. Es erkennt deutsche und englische Überschriften, Titelzeilen über der Kopfzeile, Tagesspalten im Raster und das Tabellenblatt.
   - Die Stationsleitung prüft und korrigiert. Nicht lesbare Werte erscheinen mit Zeilennummer.
   - Die Zuordnung wird pro Profil und Station gemerkt, solange die Kopfzeile gleich bleibt.
3. **Prüfen** (auf dem Server):
   - **Unbekannte Mitarbeiter-IDs** einer Person zuordnen. Die Zuordnung wird gespeichert.
   - **Unbekannte Dienstkürzel** einer Schichtart, „Frei“ oder „Ignorieren“ zuordnen. Auch das wird für die Station gespeichert.
   - Andere Fehler (außerhalb des Zeitraums, Überschneidung in der Datei, ungültige Zeiten) im Quellprogramm korrigieren und die Datei neu hochladen.
   - Solange es Fehler gibt, geht es nicht weiter.
4. **Vorschau:** neue, geänderte, entfallende und unveränderte Dienste.
   - Einträge, die in ShiftCare von Hand angelegt oder geändert wurden, sind markiert.
   - Fiele mehr als die Hälfte des bisherigen Plans weg, erscheint eine deutliche Warnung.
5. **Übernehmen:** Die Änderungen werden in einer einzigen Transaktion geschrieben, ganz oder gar nicht.
   - Gibt es noch keinen Plan für den Monat, wird er als Entwurf angelegt.
   - Ist der Plan schon veröffentlicht, bekommt jede betroffene Person **eine** zusammengefasste Benachrichtigung.
6. **Veröffentlichen:** über die bestehende Funktion `publish_schedule()`. Erst danach sieht das Team einen neuen Plan.

Unter **Verlauf** stehen alle Importe mit Status, Zeitpunkt, Station, Monat, verantwortlicher Person und einer verständlichen Zusammenfassung. Geprüfte, aber nicht übernommene Importe lassen sich dort fortsetzen.

**Regel: Die Datei ist der vollständige Plan der Station für den Monat.** Einträge, die nicht in der Datei stehen, entfallen beim Übernehmen. Die Vorschau zeigt das vorher. Bitte bestätigen, siehe OPEN_POINTS I1.

## Architektur

```
Browser                                   Datenbank (Supabase, RLS)
┌──────────────────────────────┐          ┌─────────────────────────────────────────────┐
│ SourceAdapter (csv, xlsx)    │          │ stage_import()  → import_runs / import_rows │
│   Datei → RawTable[]         │          │ resolve_import(): Mitarbeiter, Kürzel,      │
│ normalize.ts                 │  Zeilen  │   Zeiten, Zeitraum, Duplikate, Konflikte    │
│   Spaltenzuordnung (Liste/   │ ───────▶ │ confirm_employee_mapping(), map_shift_code()│
│   Raster), Datum/Zeit/Pause  │          │ preview_import()  (Diff, nur lesend)        │
│   → StagingRow[]             │          │ apply_import()    (idempotent, atomar)      │
└──────────────────────────────┘          │ publish_schedule() (bestehend)              │
                                          │   → Benachrichtigungen / Push-Queue         │
                                          └─────────────────────────────────────────────┘
```

Die Aufgaben sind getrennt:

| Aufgabe | Ort |
| --- | --- |
| Verbindung, Authentifizierung | künftig Adapter auf dem Server (Edge Function), Zugangsdaten aus Vault; heute nicht benötigt (Dateiupload) |
| Datenabruf / Dateiimport | `SourceAdapter.readFile` (Datei) bzw. künftig `fetchTables` |
| Parsing | `csv.ts`, `xlsx.ts` |
| Feldzuordnung, Normalisierung | `normalize.ts` (`suggestMapping`, `toStagingRows`, `parseDate`, `parseTime`, `parseBreak`) |
| Mitarbeiterzuordnung, Dienstnormalisierung, Validierung | `private.resolve_import()` (Server, verbindlich) |
| Änderungsvergleich | `private.import_diff()` / `preview_import()` |
| Speicherung | `apply_import()` |
| Veröffentlichung | `publish_schedule()` + Trigger `schedules_publish_imports` |

Der Browser prüft nur, ob er die Datei lesen kann. **Verbindlich prüft der Server.** Dort wird alles erneut aufgelöst und validiert, auch Zeilen, die direkt an die API geschickt werden.

## Schnittstelle für neue Adapter

`src/domain/integration/adapters.ts`:

```ts
interface SourceAdapter {
  id: string
  labelKey: string
  kind: 'file' | 'api'
  accepts?: (fileName: string, mimeType: string) => boolean    // Datei-Adapter
  readFile?: (bytes: Uint8Array, fileName: string) => RawTable[]
  testConnection?: () => Promise<{ ok: boolean; message?: string }>   // API-Adapter
  fetchTables?: (period: { from: string; to: string }) => Promise<RawTable[]>
}
```

Ein Adapter liefert nur `RawTable`s (Kopfzeile, Zeilen als Text, Zeilennummern). Alles danach ist gemeinsam: Zuordnung, Normalisierung, Server-Prüfung, Diff, Übernahme und Veröffentlichung.

**Neues Dateiformat:**
1. Adapter mit `accepts` und `readFile` schreiben.
2. In `ADAPTERS` eintragen.
3. Tests mit echten Beispieldateien in `__fixtures__` ergänzen (Generator: `scripts/fixtures/make-import-fixtures.py`).

**Direkte Anbieter-Schnittstelle:** Vor jeder Umsetzung muss geklärt und dokumentiert sein:
- Gibt es eine **offizielle API**, und darf ShiftCare sie nutzen (Vertrag, Lizenz, Zustimmung der Einrichtung)?
- Wie wird **authentifiziert** (OAuth, API-Key, Zertifikat)? Wie werden die Zugangsdaten erneuert?
- Welche Daten sind abrufbar (Dienste, Kürzel, Mitarbeiterkennungen, Stationen)?
- Lassen sich **Änderungen erkennen** (Zeitstempel, Versionen, Webhooks)?
- Was muss das Krankenhaus bereitstellen (Netzfreigaben, Konten, Exporte)?

Danach folgt die Umsetzung:
- Eine Edge Function `sync-<anbieter>` liest das Profil (`integration_sources`) und das Geheimnis aus Vault (`secret_id`, nur mit Service-Rolle).
- Sie ruft `fetchTables`/`testConnection` auf und gibt die normalisierten Zeilen an `stage_import` weiter.
- Dafür sollte es eine Service-Variante mit expliziter Einrichtungs- und Stationsprüfung geben.
- Ob automatisch übernommen und veröffentlicht wird, regelt eine ausdrückliche Einstellung im Profil (siehe OPEN_POINTS I3). Standard: nur prüfen, Freigabe durch die Leitung.
- Erst danach den Adapter in `ADAPTERS` eintragen und die Art in der Oberfläche freigeben.

## Einheitliches Dienstplanmodell

Ein Dienst ist ein Eintrag in `schedule_entries`. Bestehende Spalten:

| Feld | Spalte |
| --- | --- |
| interne Dienst-ID | `id` |
| Einrichtung | `hospital_id` |
| Bereich / Station | `schedules.unit_id` → `units.department_id` |
| Mitarbeiter | `employee_id` (NULL = offener Dienst) |
| Datum, Beginn, Ende | `entry_date`, `starts_at`, `ends_at` (timestamptz, Zeitzone der Einrichtung; Nachtdienste enden am Folgetag) |
| Diensttyp | `kind` (`shift`/`off`) + `shift_type_id` |
| Veröffentlichungsstatus | `schedules.status` (`draft`, `published`, `archived`) + `version` |

Neu für die Herkunft:

| Feld | Spalte |
| --- | --- |
| Pause | `break_minutes` (NULL = Pause der Schichtart) |
| Quellsystem | `source_id` → `integration_sources` |
| externe Dienst-ID | `external_id` |
| stabile Import-Identität | `import_key`: externe Dienst-ID, sonst Person + Tag + Laufnummer; eindeutig pro Dienstplan |
| Import / Aktualisierung | `import_run_id`, `imported_at`, `updated_at` |

Die Verknüpfung zur Quelle läuft über `import_run_id` → `import_rows` (Zeilennummer, Werte, Meldungen).

**Datensparsamkeit:**
- Namen aus der Datei (`employee_label`) und die Originalzellen (`raw`) werden **bei der Veröffentlichung gelöscht**, spätestens nach 30 Tagen (pg_cron `shiftcare-import-purge`).
- Die Datei selbst wird nie hochgeladen. Gespeichert werden nur Dateiname und SHA-256.

## Mitarbeiterzuordnung

Die Reihenfolge:
1. Bestätigte Zuordnung „ID in der Quelle → Person“ (`employee_external_ids`, pro Profil).
2. Exakt gleiche **Personalnummer** derselben Einrichtung, wenn die ID nicht schon für eine andere Person bestätigt ist.
3. Sonst gilt die Zeile als **Fehler**. Eine berechtigte Person wählt die passende Person aus, die Zuordnung wird gespeichert.

**Namen werden nie automatisch zugeordnet.**

Was die Datenbank verhindert:
- **Zuordnung zu einer anderen Einrichtung:** Zusammengesetzte Fremdschlüssel (`hospital_id`, …) machen sie unmöglich, auch für den Server.
- **Doppelte Zuordnungen:** Pro Profil ist eine ID genau einer Person zugeordnet und umgekehrt (`unique`).
- **Neue Konten:** Der Import legt keine Konten an. Mitarbeitende kommen nur über die Verwaltung (Einladung).
- **Veröffentlichung unklarer Dienste:** Solange es Fehler gibt, ist `apply_import` gesperrt.

## Konfiguration pro Einrichtung (Verwaltung → Integrationen)

Ein Importprofil (`integration_sources`) hat:
- Name
- Art (`file`, `api`, `sftp`)
- Quellsystem (freier Text)
- Station (optional)
- Standard-Datumsformat
- Aktiv-Status
- Zugangsdaten (nur `api`/`sftp`)

Die Zugangsdaten setzt `set_integration_secret()` **nur schreibend** in Supabase Vault. Die Spalte `secret_id` ist über die API nicht lesbar (Spaltenrechte). In `settings` stehen nie Geheimnisse.

Gespeicherte Zuordnungen pro Profil:
- **Dienstkürzel** (`shift_code_mappings`): pro Station oder hausweit.
- **Mitarbeiterkennungen** (`employee_external_ids`).

Feldzuordnungen werden pro Profil und Station aus dem letzten Import übernommen.

**Rechte (RLS, serverseitig):**

| Recht | Wer | Darf |
| --- | --- | --- |
| `schedule.import` | Stationsleitung, Stellvertretung, PDL | im eigenen Bereich importieren, Kürzel und Mitarbeitende des Bereichs zuordnen, eigene Importe sehen |
| `integrations.manage` | Krankenhaus-Administration | Profile, hausweite Kürzel und Zugangsdaten verwalten, alle Importe sehen |
| `schedule.manage` / `schedule.publish` | (bestehend) | zusätzlich nötig zum Übernehmen bzw. Veröffentlichen |

Eine Einrichtung sieht keine Profile, Zuordnungen, Importe oder Protokolle einer anderen. Profile, Zuordnungen und Importläufe laufen über das Audit-Log.

## Änderungen, Wiederholungen, Konflikte

| Fall | Verhalten |
| --- | --- |
| Gleiche Datei noch einmal | wird erkannt (SHA-256, Hinweis „gleiche Datei“). Die Vorschau zeigt „unverändert“, beim Übernehmen entstehen **keine** doppelten Dienste (`import_key`). |
| Geänderter oder entfallener Dienst | erscheint in der Vorschau als „geändert“ bzw. „entfällt“. Ein geänderter Dienst behält seine ID. |
| `apply_import` zweimal | der zweite Aufruf wird abgelehnt (`55000`). |
| Technischer Fehler beim Übernehmen (z. B. Überschneidung mit einem Dienst auf einer anderen Station) | Es wird nichts geschrieben, der Import bleibt „geprüft“, der Fehler steht im Verlauf. **Erneut versuchen** ist möglich. |
| Veraltete Datei (inzwischen wurde eine neuere für Station und Monat übernommen) | Übernehmen wird verweigert (Status „überholt“). Ältere, noch nicht übernommene Uploads werden beim Übernehmen automatisch als überholt markiert. |
| Gleichzeitige Importe | werden über eine Sperre auf dem Dienstplan serialisiert. |
| Handänderungen in ShiftCare | Die Vorschau markiert sie. Die Datei bleibt führend. |
| Versionsstände | `schedules.version` bei jeder Veröffentlichung; Importläufe mit Zeitpunkt, Person, Diff-Zahlen und Datei-Hash. |

## Wunschplan

Imports schreiben ausschließlich `schedule_entries`. Wünsche (`wish_entries`) werden nie gelesen oder verändert. Das ist getestet. Der Dienstplan-Editor zeigt Wunsch und Plan weiterhin nebeneinander.

## Mobile Ansicht und Benachrichtigungen

- Mitarbeitende sehen nur ihre eigenen Dienste aus veröffentlichten oder archivierten Plänen (RLS).
- Es gibt Monats-, Wochen- und Tagesansicht mit Dienstart, Beginn, Ende und Station, dazu **„Stand: …“** (letzte Änderung).
- Benachrichtigungen werden zuerst in `notifications` gespeichert. Der Push-Versand läuft getrennt über `notification_deliveries`.
- Ein Push gilt erst als zugestellt, wenn `push-dispatch` die Annahme durch den Push-Dienst bestätigt (`status = 'sent'`). Die Dienstplandaten hängen davon nicht ab.

## Tests

- `src/domain/integration/integration.test.ts`:
  - CSV: Anführungszeichen, Trennzeichen, Zeichensätze.
  - XLSX: openpyxl, LibreOffice, Inline-Strings, mehrere Blätter.
  - Liste und Raster, Spaltenvorschläge, Datums-, Zeit- und Pausenformate, Excel-Seriennummern, Nachtdienste, Zeilennummern.
- `supabase/tests/06_integration.test.sql`:
  - Zuordnung per Personalnummer und bestätigter ID, keine Namenszuordnung.
  - Unbekannte Kürzel und Personen, Nachtdienst über Mitternacht, Duplikate, Zeitraum.
  - Doppelter Import, geänderte und entfernte Dienste, Wiederholung nach Fehler, veraltete Uploads.
  - Mehrere Einrichtungen, Rechte, Geheimnisse, Bereinigung bei der Veröffentlichung, Benachrichtigungen, Wünsche unverändert.
- `scripts/e2e/smoke.mjs`: der komplette Ablauf im Browser bis zur Anzeige beim Mitarbeiter.
