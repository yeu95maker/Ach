# Dienstwerk-Schnittstelle (Roster Exchange v1)

Stand: 11.10.2026. Diese Schnittstelle ist für **Dienstplanprogramme, Krankenhaus-IT und Export-Jobs**. Darüber schicken sie den **veröffentlichten Dienstplan** einer Station automatisch an Dienstwerk. Damit muss die Stationsleitung den Plan nicht doppelt eingeben.

## Was passiert mit einer Lieferung

1. Das System schickt den aktuellen Plan einer Station für einen Zeitraum, meist einen Monat.
2. Dienstwerk prüft die Lieferung genauso wie einen Dateiimport. Es ordnet die Mitarbeitenden zu, über bestätigte IDs oder die genaue Personalnummer und **nie über den Namen**. Es ordnet die Dienstkürzel zu und prüft Zeiten und Zeitraum.
3. **Unverändert** gegenüber der letzten Lieferung oder gegenüber dem aktuellen Plan bedeutet: Es passiert nichts, und niemand wird gestört.
4. **Bei Änderungen** bekommt die Stationsleitung die Benachrichtigung „Neuer Dienstplanstand aus …“. Ein Tipp öffnet die Vorschau mit neuen, geänderten und entfallenen Diensten. Ein weiterer Tipp übernimmt die Änderungen. Bei veröffentlichtem Plan erhalten **nur die betroffenen Mitarbeitenden** eine Push-Nachricht.
5. Kommt eine neuere Lieferung, bevor die Leitung bestätigt hat, ersetzt sie die ältere. Es wartet immer nur die neueste Version.

Entscheidung vom 11.10.2026: Änderungen werden **nicht ohne Bestätigung der Leitung** veröffentlicht.

## Einrichtung (Verwaltung → Integrationen)

1. **Importprofil anlegen**, Art **„Dienstwerk-Schnittstelle (automatisch)“**. Optional auf eine Station beschränken.
2. **Neuer Schlüssel**: Der API-Schlüssel (`pls_…`) wird **nur einmal angezeigt**. Gespeichert wird nur sein SHA-256-Hash, niemand kann ihn später auslesen. Pro Profil sind bis zu 5 aktive Schlüssel möglich, jeder lässt sich einzeln sperren.
3. Adresse und Schlüssel sicher an die IT bzw. den Hersteller weitergeben.

## Anfrage

```http
POST https://<projekt>.supabase.co/functions/v1/roster-sync
Authorization: Bearer pls_…          (alternativ: X-Dienstwerk-Key: pls_…)
Content-Type: application/json
```

```json
{
  "unit": "3A",
  "period": { "start": "2026-11-01", "end": "2026-11-30" },
  "source_version": "Plan November v7",
  "shifts": [
    { "employee": "P-1001", "date": "2026-11-02", "code": "F" },
    { "employee": "P-1002", "date": "2026-11-02", "code": "N", "start": "21:45", "end": "06:15", "break_minutes": 30, "id": "4711" },
    { "employee": "P-1003", "date": "2026-11-03", "code": "X" }
  ]
}
```

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `unit` | ja | Stationskürzel wie in Dienstwerk (Verwaltung → Organisation), Groß-/Kleinschreibung egal |
| `period.start`, `period.end` | ja | Zeitraum, für den die Lieferung **vollständig** ist (1–63 Tage, `YYYY-MM-DD`). Was im Zeitraum nicht geliefert wird, gilt als entfallen. |
| `source_version` | nein | Versionsangabe des Quellsystems, erscheint im Verlauf |
| `shifts[]` | ja | alle Dienste und freien Tage im Zeitraum; leeres Array = Zeitraum leeren (mit Warnung in der Vorschau) |
| `shifts[].employee` | ja | Personalnummer bzw. ID im Quellsystem |
| `shifts[].date` | ja | Tag des Dienstbeginns |
| `shifts[].code` | ja, außer bei Start/Ende | Dienstkürzel des Quellsystems; Zuordnung zu Dienstwerk-Diensttypen einmalig in der App |
| `shifts[].start`, `.end` | nein | `HH:MM`, nur zusammen. Ende ≤ Beginn bedeutet Nachtdienst bis zum Folgetag. |
| `shifts[].break_minutes` | nein | Pause 0–600 |
| `shifts[].id` | nein | stabile Dienst-ID des Quellsystems; damit erkennt Dienstwerk Änderungen am selben Dienst |
| `shifts[].name` | nein | nur zur Anzeige bei unbekannten IDs; wird nach der Veröffentlichung gelöscht |

Größenlimit: 5 MB und 10 000 Dienste pro Lieferung, höchstens 120 Lieferungen pro Stunde und Profil.

## Antworten

| Status | Inhalt | Bedeutung |
| --- | --- | --- |
| `202` | `{"status":"staged","run_id":"…","changes":3,"errors":0,"warnings":0}` | angenommen, wartet auf die Leitung |
| `200` | `{"status":"unchanged","run_id":"…"}` | genau diese Lieferung kam schon |
| `200` | `{"status":"no_changes","run_id":"…"}` | Inhalt entspricht dem aktuellen Plan |
| `401` | `missing_api_key` / `Invalid API key` | Schlüssel fehlt, ist falsch oder gesperrt |
| `422` | `invalid_payload` mit `details[]`, oder z. B. `Unknown ward code "3C"` | Format- oder Inhaltsfehler |
| `429` | | zu viele Lieferungen |

`errors > 0` bedeutet: Einzelne Zeilen lassen sich noch nicht zuordnen, etwa eine unbekannte Personalnummer oder ein unbekanntes Kürzel. Die Leitung ordnet sie einmalig in der App zu. Danach gelingt das bei allen weiteren Lieferungen automatisch.

## Beispiel mit curl

```sh
curl -X POST "https://<projekt>.supabase.co/functions/v1/roster-sync" \
  -H "Authorization: Bearer $DIENSTWERK_KEY" -H "Content-Type: application/json" \
  --data @dienstplan-3A-2026-11.json
```

Empfehlung für die Anbindung: Liefern, wenn im Quellsystem ein Plan veröffentlicht oder geändert wird, oder per Zeitplan, z. B. stündlich. Unveränderte Lieferungen kosten nichts.

## Was es (noch) nicht gibt

- **Fertige Direktanbindungen an einzelne Hersteller** (ATOSS, SP-Expert, PEP, Clinic Planner, Time Office …). Für jede solche Anbindung braucht es die Schnittstellenbeschreibung und einen Testzugang des Herstellers, meist über ein Krankenhaus, das Kunde ist. Technisch kommt jede Anbindung als eigener Adapter hinzu, der die Daten des Herstellers in dieses Format übersetzt (siehe [INTEGRATION-HUB.md](INTEGRATION-HUB.md)).
- **Automatischer Dateiabruf** (SFTP/Netzlaufwerk). Bis dahin lässt sich ein geplanter CSV-Export mit einem kleinen Skript in dieses Format umwandeln und senden.
- **PDF-Import**. Dienstplan-PDFs unterscheiden sich je nach System stark und lassen sich nicht zuverlässig lesen.

## Technik

- Edge Function `supabase/functions/roster-sync` (Deploy mit `--no-verify-jwt`), Formatprüfung in `_shared/rosterPayload.ts` (Unit-Tests)
- Datenbank: `public.ingest_roster(key, payload)`, ausführbar nur mit der Service-Rolle; Schlüssel in `integration_api_keys` (nur Hash, Spaltenrechte). Migration `20261014000200_roster_sync.sql`.
- Tests: `supabase/tests/08_roster_sync.test.sql` (Schlüssel, Rechte, Idempotenz, Ablösung älterer Stände, Benachrichtigung, Bestätigung) und der Browsertest (Profil und Schlüssel anlegen, Lieferung, Bestätigung durch die Leitung)
