# Stationschat

Stand: 11.10.2026. Entscheidung vom 11.10.2026: **ein Chat pro Station**, keine Direktnachrichten, keine eigenen Gruppen, keine automatischen Karten bei Krankmeldungen.

## Was es gibt

- **Ein Chat pro Station**, automatisch für alle aktiven Mitarbeitenden, die der Station zugeordnet sind. Wer mehreren Stationen angehört (z. B. Jonas: 3A und ITS 1), wählt oben die Station.
- **Schreiben, bearbeiten, löschen:** Jede Person bearbeitet und löscht nur eigene Nachrichten. Gelöschte Nachrichten zeigen „Nachricht gelöscht“, der Text ist aus der Datenbank entfernt.
- **Moderation:** Wer das Recht `chat.moderate` für die Station hat (Stationsleitung, Stellvertretung, PDL für ihre Abteilung), kann Nachrichten anderer **ausblenden**. Auch dann wird der Text gelöscht, es bleibt „Von der Leitung ausgeblendet“. Eine PDL, die nicht Mitglied der Station ist, liest und schreibt als Leitung mit; das steht als Hinweis über dem Chat.
- **Ungelesen:** Zähler am Team-Symbol in der Navigation und auf der Chat-Karte im Team-Bereich, Trennlinie „Neue Nachrichten“ beim Öffnen.
- **Benachrichtigungen:** pro Person **eine** Benachrichtigung „Neue Nachrichten im Stationschat · Station 3A“, bis sie den Chat öffnet. Weitere Nachrichten erzeugen keine neuen Benachrichtigungen. Die Benachrichtigung (auch Push) enthält **nie den Text**, damit auf dem Sperrbildschirm nichts mitgelesen wird.
- **Live:** neue, geänderte und gelöschte Nachrichten erscheinen sofort (Supabase Realtime); zusätzlich wird alle 20 Sekunden nachgeladen, falls Realtime nicht verfügbar ist.
- **Schutz vor Missbrauch:** 1–2000 Zeichen, höchstens 20 Nachrichten pro Minute und Person.
- **Hinweis im Chat:** „Bitte keine Patientendaten und keine Gesundheitsangaben.“

## Wer was sehen kann

| Person | Stationschat lesen | schreiben | ausblenden |
| --- | --- | --- | --- |
| Mitglied der Station | ✓ | ✓ | – |
| Stationsleitung / Stellvertretung der Station | ✓ | ✓ | ✓ |
| PDL (Abteilung) | ✓ (alle Stationen der Abteilung) | ✓ | ✓ |
| Personalabteilung, Krankenhaus-Administration | – | – | – |
| andere Stationen, andere Häuser | – | – | – |

Die Krankenhaus-Administration hat absichtlich **kein** Leserecht: Sie konfiguriert das System, liest aber keine Teamgespräche. Durchgesetzt wird das in der Datenbank (RLS), nicht in der Oberfläche.

## Technik

- Migrationen `20261013000100_unit_chat_types.sql` (Recht `chat.moderate`) und `20261013000200_unit_chat.sql`
- Tabellen `unit_messages` (Text, Autor, Zeitstempel, `deleted_at`, `hidden_at`) und `unit_chat_reads` (zuletzt gelesen)
- Lesen per RLS (`private.chat_unit_ids()`), Schreiben nur über RPCs: `send_unit_message`, `edit_unit_message`, `delete_unit_message`, `hide_unit_message`, `mark_unit_chat_read`, `get_unit_messages` (mit Autorennamen, seitenweise), `my_unit_chats` (Stationen mit Ungelesen-Zähler)
- Kein Audit-Protokoll der Nachrichtentexte: Löschen und Ausblenden entfernen den Text wirklich.
- Frontend: `src/features/chat/`, Logik für Tagestrenner, Gruppierung und „Neue Nachrichten“ in `src/domain/chat.ts` (Unit-Tests)
- Tests: `supabase/tests/07_unit_chat.test.sql` (Zugriff, Isolation, Benachrichtigungen, Bearbeiten, Moderation, Flutschutz), Browsertest im Smoke-Test

## Offen

- **Aufbewahrung:** Nachrichten bleiben derzeit unbegrenzt. Eine Frist (z. B. automatische Löschung nach 12 Monaten) sollte mit Datenschutz und Betriebsrat festgelegt werden (OPEN_POINTS C1).
- **Mitbestimmung:** Ein Chat am Arbeitsplatz ist in Deutschland in der Regel mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 6 BetrVG), weil er technisch zur Leistungs- und Verhaltenskontrolle geeignet ist. Vor dem Einsatz mit dem Betriebs-/Personalrat abstimmen.
- Anhänge (Fotos, Dateien), Reaktionen und Erwähnungen gibt es nicht.
