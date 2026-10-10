# Wunschplan

Mitarbeitende tragen für einen künftigen Planungszeitraum ihre Wünsche ein. Die Dienstplanung sieht diese Wünsche beim Erstellen des Dienstplans und entscheidet selbst.

> **Grundregel:** Ein Wunsch ist eine Präferenz, **nie** ein bestätigter Dienst. Wünsche liegen in eigenen Tabellen und werden nie in den Dienstplan (`schedule_entries`) geschrieben, weder automatisch noch durch eine KI.

## Ablauf

```
Dienstplanung legt Wunschplan an (Station + Monat + Frist)
        │  öffnen → Benachrichtigung „Wunschplan geöffnet“
        ▼
Mitarbeitende: Wunschart wählen → Tage antippen → einreichen
        │  Bestätigung „Dein Wunschplan wurde erfolgreich eingereicht.“
        │  bis zur Frist änderbar (falls erlaubt)
        │  X Tage vor Frist: Erinnerung an alle ohne Einreichung
        ▼
Frist erreicht → automatisch gesperrt → Benachrichtigung „Wunschplan gesperrt“
        │  (Wiederöffnen mit neuer Frist möglich)
        ▼
Dienstplanung: Matrix Wunsch ↔ geplanter Dienst, Wünsche bewerten
        │  → Benachrichtigung „Deine Wünsche wurden bewertet“
        ▼
Dienstplan veröffentlichen → Benachrichtigung „Neuer Dienstplan“ (bestehend)
```

## Wunscharten

| Key | Bezeichnung | Farbe | Icon | Gewicht* |
| --- | --- | --- | --- | --- |
| `free` | Wunschfrei | Grün | Tasse | 2 |
| `night` | Wunschnacht | Lila | Mond | 1 |
| `early` | Wunschfrühdienst | Blau | Sonnenaufgang | 1 |
| `late` | Wunschspätdienst | Orange | Sonnenuntergang | 1 |
| `preferred` | Bevorzugter Dienst (konkreter Schichttyp) | Türkis | Stern | 1 |
| `unavailable` | Nicht verfügbar | Rot | Verbotszeichen | 3 (starker Wunsch, **kein** harter Ausschluss) |

\*Das Gewicht in `wish_preference_types` ist für eine künftige Planungsunterstützung vorbereitet. Die Farben der Wünsche unterscheiden sich bewusst von den Dienstplanfarben, damit Wunsch und Plan nie verwechselt werden.

## Standardwerte (entschieden 10.10.2026)

- Frist: **21 Tage** vor Beginn des Zeitraums
- Erinnerung: **3 Tage** vor der Frist, einmalig, an alle ohne Einreichung
- **Kein Limit** für Wunschfrei. Ein Limit ist pro Haus oder Station optional konfigurierbar.
- „Nicht verfügbar“ ist ein starker Wunsch und kein harter Ausschluss. Die Planung sieht den Widerspruch rot markiert und entscheidet selbst.

## Status

**Pro Wunsch:**
- *Eingereicht*
- *In Prüfung*
- *Berücksichtigt*
- *Nicht berücksichtigt*
- *Gesperrt*: Die Frist ist abgelaufen und der Wunsch wurde noch nicht bewertet.

Ändert die Mitarbeiterin einen Wunsch, beginnt er wieder bei *Eingereicht*. Unveränderte Wünsche behalten ihren Status.

**Pro Zeitraum:** *Entwurf* → *Offen* → *Gesperrt* → (*Offen* = wiedereröffnet) → *Archiviert*. Ungültige Übergänge lehnt die Datenbank ab. Öffnen geht nur mit einer Frist in der Zukunft.

## Datenmodell (Migrationen `20261010000300/0400`)

| Tabelle | Inhalt |
| --- | --- |
| `wish_preference_types` | Katalog der Wunscharten inkl. Schichtkategorie und Gewicht |
| `wish_plan_settings` | Konfiguration pro Haus (`unit_id IS NULL`) mit optionaler Übersteuerung pro Station: aktiv, Änderungen nach Einreichung, Standardfrist, Erinnerung, max. Wünsche, max. Wunschfrei |
| `wish_periods` | Wunschplan pro Station und Zeitraum: Frist, Status, Öffnungszeitpunkt, „Änderungen erlaubt“; keine Überlappung pro Station |
| `wish_submissions` | eine Einreichung pro Mitarbeiter und Zeitraum (allgemeine Notiz) |
| `wish_entries` | ein Wunsch pro Tag mit Notiz, Status und Rückmeldung; Datum muss im Zeitraum liegen |
| `staffing_requirements` | *(KI-Vorbereitung)* Mindest- und Sollbesetzung pro Station, Schichttyp, Wochentag und Qualifikation |
| `schedule_suggestions` | *(KI-Vorbereitung)* erzeugte Planvorschläge mit Eingabe-Snapshot und Bewertung. Sie werden **nie** automatisch angewendet und können nicht als „angenommen“ angelegt werden. |

Alle Tabellen hängen über zusammengesetzte Fremdschlüssel am Krankenhaus, haben RLS und laufen über den Audit-Trigger.

### Rechte

| Berechtigung | Rollen | Bedeutung |
| --- | --- | --- |
| `wishes.submit` | Pflegekraft (auch als Schichtleitung), Stationsleitung, stellvertretende Stationsleitung, **nicht HR** | eigenen Wunschplan für die eigene(n) Station(en) einreichen |
| `wishes.view` | Stationsleitung, stellv. Stationsleitung, Pflegedienstleitung, Hospital-Admin | Wünsche im eigenen Bereich sehen |
| `wishes.manage` | Stationsleitung, stellv. Stationsleitung, Pflegedienstleitung, Hospital-Admin | Zeiträume, Fristen und Konfiguration verwalten; Wünsche bewerten |

- Kolleg:innen und die Schichtleitung sehen **keine** fremden Wünsche.
- Bewertet werden können nur Wünsche anderer Personen, nie die eigenen.
- Einreichen läuft ausschließlich über `submit_wish_plan()`. Diese Funktion prüft:
  - Stationszugehörigkeit
  - Status *Offen*
  - Frist
  - „Änderungen erlaubt“
  - Limits
  - Gültigkeit der Daten

### Automatisierung
`private.run_wish_plan_jobs()` öffnet geplante Zeiträume, erinnert vor der Frist (einmalig, nur wer noch nicht eingereicht hat) und sperrt abgelaufene Zeiträume. Die Funktion läuft per **pg_cron** alle 15 Minuten, sofern die Extension aktiv ist (Supabase: Integrations → Cron). Die Frist wird zusätzlich bei jeder Einreichung geprüft, also auch dann, wenn der Job noch nicht gelaufen ist.

## Oberfläche

**Dienstplan → Wunschplan** (`/schedule/wishes`)
- Zeitraum wählen, Frist-Hinweis mit Countdown: „Wunschplan für November kann bis zum … eingereicht werden.“
- **Pinsel-Prinzip:** Wunschart einmal wählen, dann beliebig viele Tage antippen. Nochmal tippen entfernt den Wunsch, ein anderer Wunsch ersetzt ihn. Ein Monat ist so in 1–2 Minuten erledigt.
- Notiz pro Tag und eine allgemeine Notiz an die Planung.
- Nach dem Einreichen sieht man den Status pro Wunsch (Symbol im Kalender) und die Rückmeldung der Planung.
- Nach der Frist ist nur noch Ansicht möglich.
- Auf dem Dashboard erscheint ein Hinweis, solange ein Wunschplan offen ist, mit Dringlichkeit in den letzten 3 Tagen.

**Dienstplan → Wunschpläne verwalten** (`/schedule/wishes/manage`)
- Filter: Monat, Abteilung, Station, Mitarbeiter:in, Datum, Wunschart, Status. Die Filter stehen in der URL und sind damit teilbar.
- **Kalender-Matrix** (Mitarbeitende × Tage):
  - oben der Wunsch (farbig), darunter der geplante Dienst (Kürzel, gestrichelt = Entwurf)
  - Widerspruch zwischen Plan und Wunsch rot umrandet, erfüllter Wunsch mit ✓
  - Mitarbeitende ohne Einreichung werden mit angezeigt
- **Liste** mit Mehrfachauswahl und Sammelbewertung.
- Wunschplan anlegen, öffnen, sperren, wieder öffnen; Frist ändern; „Änderungen bis zur Frist erlauben“.
- Von „Dienstpläne verwalten“ führt ein direkter Link zu den Wünschen der Station und des Monats.

## Vorbereitung KI-gestützte Planung

```
get_scheduling_context(unit, from, to)  ──►  Planungsassistent (extern, später)
  shift_types, staffing_requirements,          │
  employees (+ Qualifikationen, Wochenstunden),│ Vorschlag + Begründung + Score
  wishes (+ Gewicht), absences (Urlaub/Krank), ▼
  assigned_shifts (inkl. 7 Tage davor → Ruhezeiten)
                                          schedule_suggestions (status = proposed)
                                                │
                              Mensch prüft ─────┴──► übernimmt Dienste bewusst in den Dienstplan
```

- `get_scheduling_context` ist read-only und nur mit `schedule.manage` für die Station aufrufbar.
- Vorschläge werden mit `generator`, `model` und `input_snapshot` gespeichert und sind damit nachvollziehbar.
- Entscheidung und Übernahme bleiben immer beim Menschen.
- Gesetzliche Regeln (z. B. Ruhezeiten nach ArbZG) gehören in die Bewertungslogik des Assistenten. Die Rohdaten dafür sind vorhanden.
