# Dokumente (SOPs) und Pflichtfortbildungen

Stand: 11.10.2026. Zu finden unter *Team → Dokumente & SOPs* bzw. *Team → Pflichtfortbildungen*. Offenes erscheint auf der Startseite in der Karte **„Zu erledigen“**.

## Dokumente mit Lesebestätigung

**Wer darf veröffentlichen?** Wer „Dokumente verwalten“ hat, also Stationsleitung, Stellvertretung, PDL, HR und Administration. Jede Person kann nur in ihrem Bereich veröffentlichen: Die Stationsleitung für ihre Station, für das ganze Haus nur Rollen mit hausweitem Recht.

1. **Neues Dokument:** Datei wählen (PDF, DOCX oder Bild bis 20 MB), dazu Titel, Art (SOP, Richtlinie, Checkliste, Formular, Information) und Station bzw. ganzes Haus. Wahlweise lässt sich eine Lesebestätigung anfordern.
2. **Ablauf beim Veröffentlichen:** Das Dokument entsteht zuerst als unsichtbarer Entwurf. Dann wird die Datei hochgeladen, erst danach wird es veröffentlicht. Ohne hochgeladene Datei lehnt die Datenbank die Veröffentlichung ab. Alle, die es betrifft, bekommen eine Benachrichtigung.
3. **Lesebestätigung:** Die Mitarbeitenden tippen auf „Gelesen und verstanden“. Die Leitung sieht „3 von 5 bestätigt“ und die Liste, wer fehlt. Mit **Erinnern** benachrichtigt sie die Fehlenden, höchstens einmal in 24 Stunden. Nach 7 Tagen geht automatisch eine Erinnerung raus.
4. **Neue Version:** Die alte Version wird archiviert, und die Lesebestätigungen beginnen neu. Das ist bei geänderten SOPs gewollt.
5. **Archivieren:** Das Dokument verschwindet für das Team.

Die Dateien liegen im privaten Speicher-Bucket. Geöffnet werden sie nur über einen 5 Minuten gültigen Link. Wer eine Datei sehen darf, entscheiden dieselben Regeln wie für die Dokumentliste: eigene Station, ganzes Haus oder Leitung. Andere Einrichtungen sehen nichts.

## Pflichtfortbildungen

**Wer legt sie an?** Wer „Fortbildungen verwalten“ hat, also Stationsleitung, Stellvertretung, PDL, HR und Administration, jeweils in ihrem Bereich.

- **Anlegen:** Titel, Wiederholung (einmalig, jährlich, alle 2 oder 3 Jahre) und Station bzw. ganzes Haus. Alle, für die die Fortbildung gilt, werden benachrichtigt.
- **Status pro Person:** **Fehlt**, **Abgelaufen**, **Bald fällig** (läuft in den nächsten 60 Tagen ab) oder **Gültig**. Die Gültigkeit ergibt sich aus Teilnahmedatum plus Wiederholung.
- **Teilnahme melden:** Jede Person meldet ihr Datum, wahlweise mit Nachweis, etwa der Teilnahmebescheinigung. Den Nachweis sehen nur die Person selbst und die Leitung. Die Kolleg:innen sehen ihn nicht.
- **Leitung:** Die Übersicht zeigt Personen × Fortbildungen. Ein Tipp auf eine Zelle öffnet den Eintrag. Dort kann die Leitung **Bestätigen** (eine selbst gemeldete Teilnahme), selbst eine **Teilnahme eintragen** (zählt sofort als bestätigt) oder **löschen**. Eigene Teilnahmen kann niemand selbst bestätigen.
- **Erinnerungen:** Ein täglicher Job (pg_cron, 06:05 UTC) erinnert, solange eine Fortbildung fehlt, abgelaufen oder bald fällig ist, höchstens alle 14 Tage. Nach einer neuen Meldung beginnt die Frist neu.

**Ehrlich gesagt, was es nicht gibt:**
- **Kein Abgleich mit Fortbildungsanbietern oder LMS:** Teilnahmen werden gemeldet oder von der Leitung eingetragen.
- **Keine automatische Prüfung der Bescheinigung:** Die Datei wird gespeichert, nicht gelesen.
- **Erinnerungen nur mit pg_cron:** Die automatischen Erinnerungen laufen nur, wenn pg_cron in Supabase aktiviert ist (Dashboard → Integrations → Cron). Ohne pg_cron gibt es nur die manuelle Erinnerung bei Dokumenten.

## Technik

- **Migrationen:** `20261016000100_documents_training_types.sql` (Benachrichtigungstypen, Recht `training.manage`) und `20261016000200_documents_training.sql`.
  - `documents` um Entwurf, Archiv, Version und Lesebestätigung erweitert. Neue Tabellen `document_acknowledgements`, `training_requirements`, `training_completions`, `training_reminders`.
  - RLS: Entwürfe und archivierte Dokumente sehen nur Verwaltende. Nachweise sehen nur die Person und die Fortbildungsverantwortlichen. Geschrieben wird nur über Funktionen.
  - Funktionen: `create_document`, `publish_document`, `archive_document`, `acknowledge_document`, `get_document_acks`, `remind_document`, `get_documents`, `get_document_training_scope`, `save_training_requirement`, `archive_training_requirement`, `report_training`, `verify_training`, `delete_training_completion`, `get_my_trainings`, `get_training_overview`, Job `private.run_document_training_jobs()`.
- **Tests:** `supabase/tests/11_documents_training.test.sql`, Unit-Tests `src/domain/documents.test.ts`, Browsertest (SOP veröffentlichen → bestätigen; Fortbildung anlegen → melden → bestätigen).
