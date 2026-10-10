# Dienstplan-Editor

**Dienstplan → Dienstplan bearbeiten** (`/schedule/plan`), für alle mit `schedule.manage` auf der Station: Stationsleitung, stellvertretende Stationsleitung, Pflegedienstleitung.

## Bedienung
1. Station und Monat wählen. Gibt es noch keinen Plan: **„Dienstplan anlegen“** erzeugt einen Entwurf. Mitarbeitende sehen ihn erst nach dem Veröffentlichen.
2. Werkzeug unten wählen: **Ansehen** · Schichttypen (F, S, N …) · **Frei** · **Löschen**.
3. Zellen antippen. Jeder Tipp wird sofort gespeichert. Erneutes Tippen mit demselben Dienst entfernt ihn.
4. **Offene Dienste:** In der Zeile „Offene Dienste“ fügt „+“ mit gewähltem Dienst einen unbesetzten Dienst hinzu. Mit „Löschen“ und Antippen wird er entfernt. Die Station wird benachrichtigt, sobald der Plan veröffentlicht ist.
5. **Ansehen** öffnet die Zelle im Detail: geplanter Dienst, Wunsch inkl. Notiz, Abwesenheit, Hinweise und Schnellauswahl. Das funktioniert auch gut auf dem Smartphone.
6. **Veröffentlichen.** Offene Hinweise werden vorher angezeigt, blockieren aber nicht.

## Was der Editor anzeigt
| Anzeige | Bedeutung |
| --- | --- |
| Farbige Zelle mit Kürzel | geplanter Dienst (Früh/Spät/Nacht-Farben wie im Dienstplan), „–“ = Frei |
| Kleines Symbol oben rechts | Wunsch der Mitarbeiterin (Wunschplan-Farben) |
| U / K (blass) | genehmigter Urlaub / Krankmeldung ohne geplanten Dienst |
| Roter Rahmen | Dienst trotz Urlaub oder Krankmeldung, oder Ruhezeit unter 11 h |
| Orangefarbener Rahmen | Dienst widerspricht dem Wunsch |
| Stunden unter dem Namen | geplante Stunden im Monat |
| Zeilen Früh/Spät/Nacht | Besetzung pro Tag, ggf. „geplant/Mindestbesetzung“; rot bei Unterbesetzung (aus `staffing_requirements`) |

Die Hinweise sind **Warnungen**; die Entscheidung bleibt bei der Planung. Hart verhindert wird nur, was nie zulässig ist: Doppelbuchungen bzw. überlappende Dienste derselben Person. Das erzwingt die Datenbank, im Editor erscheint dafür die Meldung „Dienst überschneidet sich“.

## Technik
- `set_schedule_cell()` (Migration `20261010000600`) setzt genau eine Zelle.
  - Sie läuft als Security Invoker, d. h. die bestehenden RLS-Regeln entscheiden, wer bearbeiten darf.
  - Ein vorhandener Eintrag wird geändert statt gelöscht und neu angelegt. Im veröffentlichten Plan entsteht so pro Änderung **eine** Benachrichtigung „Dienst geändert“.
- Planungsregeln liegen als reine, getestete Funktionen in `src/domain/rosterPlanning.ts`: Ruhezeiten, Hinweise pro Zelle, Tagesbesetzung, Mindestbesetzung, Werkzeug-Logik.
- Wünsche werden nur **angezeigt** und nie übernommen.
- Tests:
  - `supabase/tests/03_schedule_editor.test.sql`: Rechte, Doppelbuchung, Benachrichtigungen
  - `src/domain/rosterPlanning.test.ts`
  - Browser-Ablauf in `scripts/e2e/smoke.mjs`

## Offene Punkte
- Mindestbesetzungen pflegen: Tabelle und RLS sind fertig, eine Oberfläche fehlt noch (siehe OPEN_POINTS B5).
- Weitere Regeln, z. B. maximale Dienste am Stück, Wochenstunden-Soll aus `weekly_hours` oder Qualifikationsmix pro Schicht, lassen sich in `rosterPlanning.ts` ergänzen.
- Kopieren und Vorlagen (Rhythmus übernehmen, Vormonat kopieren) sind noch nicht vorhanden.
