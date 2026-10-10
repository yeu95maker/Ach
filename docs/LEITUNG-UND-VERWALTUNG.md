# Leitung, Aktuelles, Verlauf und Verwaltung

Stand: 11.10.2026. Umgesetzt nach den Entscheidungen vom 11.10.2026:
- Offene Dienste: Mitarbeitende können Interesse melden.
- Wünsche werden nach der Veröffentlichung nicht automatisch bewertet.
- Der Admin-Bereich wird gebaut.
- Aktuelles bekommt Kategorien.
- Leitungsfunktionen, Dienstplan-Historie und eine weniger prominente Krankmeldung.

## Aktuelles (`/news`)

| Kategorie | Schlüssel |
| --- | --- |
| Information (neue Information) | `information` |
| Fortbildung | `training` |
| Weiterbildung | `further_education` |
| Workshop | `workshop` |
| Teamsitzung | `team_meeting` |
| Gespräch mit Ärzten | `doctor_meeting` |
| Sonstiges | `other` |

**Für Leitungen** (Recht `announcements.publish`):
- Mit „Neu“ senden sie eine Nachricht an ihre Station oder, mit hausweitem Recht, an das ganze Haus.
- Die Nachricht hat Kategorie, Titel und Text. Optional kommen Termin (Datum, von–bis) und Ort dazu, außerdem die Markierung „wichtig“.
- Alle Empfänger bekommen eine Mitteilung in der App und per Push. Die Leitung selbst bekommt keine.
- Eigene Nachrichten und Nachrichten der eigenen Station kann die Leitung löschen.

**Anzeige:**
- Oben stehen die „Termine“: kommende Termine, der nächste zuerst.
- Darunter stehen die „Neuigkeiten“, die neueste zuerst.
- Filtern geht nach Kategorie.
- Das Dashboard zeigt die nächsten Termine und Neuigkeiten.

**Technik:**
- Spalten `category`, `event_starts_at`, `event_ends_at` und `location` in `announcements`.
- `my_announcement_targets()` liefert, wohin jemand senden darf.
- Die Rechte prüft RLS (`can_publish_announcement`).

## Leitungen: Team, Dienstplan, Vertretung bei Krankheit

**Team und Dienstplan:**
- Leitungen sehen alle Mitarbeitenden des Hauses, mit Kontaktdaten in ihrem Bereich (Team → Kollegen).
- Den Dienstplan ihrer Station bearbeiten sie vollständig im Editor, auch nach der Veröffentlichung. Betroffene werden benachrichtigt.

**Vertretung bei Krankheit (Team → Krankmeldungen):**
- Jede Krankmeldung zeigt die betroffenen Dienste der erkrankten Person.
- „Vertretung finden“ öffnet **„Wer kann übernehmen?“**. Dort stehen alle aktiven Mitglieder der Station in drei Gruppen:
  - **Passt:** frei, keine Abwesenheit, mindestens 11 h Ruhezeit davor und danach, kein Wunsch „frei“ oder „nicht verfügbar“.
  - **Möglich, mit Hinweis:** z. B. Ruhezeit nur 7,5 h, Wunsch „frei“ oder „Frei“ geplant.
  - **Nicht verfügbar:** Urlaub, krank oder zur selben Zeit im Dienst.
- Pro Person sieht man außerdem die Dienste und Stunden im laufenden Monat. Wer Interesse gemeldet hat, steht oben.
- **Einplanen** gibt den Dienst mit einem Tipp an die Person. Ein geplantes „Frei“ an dem Tag wird ersetzt. Beide werden benachrichtigt.
- **Als offenen Dienst ausschreiben:** Die Station wird benachrichtigt und kann Interesse melden.
- Dieselbe Ansicht gibt es im Dienstplan-Editor in den Zelldetails.

**Technik:**
- `get_sick_leave_shifts()`, `get_shift_candidates()`, `assign_shift()` und `release_shift()`.
- Alle prüfen `schedule.manage` für die Station.
- Doppelbuchungen verhindert die Datenbank.

## Offene Dienste (`/schedule/open`)

- Mitarbeitende der Station tippen auf **„Ich kann einspringen“** und können das Interesse wieder zurückziehen.
- Wer zur selben Zeit schon Dienst hat, kann sich nicht melden.
- Die Leitung wird benachrichtigt (`open_shift_interest`). Sie sieht die Zahl der Interessierten und besetzt den Dienst über dieselbe Kandidatenliste.
- Mit der Zuteilung wird das Interesse der ausgewählten Person „angenommen“, alle anderen werden „abgelehnt“.

## Mein Verlauf (`/schedule/history`)

- Jede Person sieht ihre Dienste **Jahr für Jahr bis zum ersten Dienst** zurück.
- Pro Monat: Anzahl der Dienste, Stunden, Verteilung Früh/Spät/Nacht sowie Urlaubs- und Krankheitstage.
- Ein Tipp auf einen Monat öffnet den Dienstplan dieses Monats.
- Archivierte Dienstpläne bleiben dafür lesbar, aber nicht änderbar.

## Krankmeldung: vorhanden, aber nicht im Vordergrund

- Krankmeldungen stehen nicht mehr in den Schnellzugriffen und nicht mehr in der Seitenleiste.
- Man erreicht sie über **Profil → Meine Anträge → Krankmeldung**.
- Für Leitungen bleibt auf dem Dashboard eine dezente Zahl „Neue Krankmeldungen“, weil sie dann eine Vertretung organisieren müssen.
- Kolleg:innen sehen weiterhin unter Team, wer krank ist, ohne Grund.

## Verwaltung (`/admin`, Profil → Verwaltung)

**Für wen:** HR und Krankenhaus-Administration, also wer `employees.manage`, `roles.assign` oder `organization.manage` hat.

**Mitarbeitende:**
- Suchen und nach aktiv/inaktiv filtern.
- **Einladen** per E-Mail: Die Person legt ihr Passwort selbst fest. Station und Rolle werden direkt zugewiesen.
- Stammdaten bearbeiten: Berufsbezeichnung, Personalnummer, Beschäftigung, Wochenstunden.
- Stationen zuordnen, mit Hauptstation.
- Rollen mit Gültigkeitsbereich vergeben: ganzes Haus, Abteilung oder Station.
- Mitarbeitende deaktivieren und wieder aktivieren.

**Stationen:** Abteilungen und Stationen anlegen, umbenennen und deaktivieren.

**Schichtarten:** Kürzel, Name, Art, Zeiten und Pause festlegen, gültig für alle Stationen oder eine bestimmte Station. Endet ein Dienst am Folgetag, wird das erkannt (z. B. Nachtdienst).

**Regel für die Rollenvergabe** (geändert, bitte bestätigen, siehe OPEN_POINTS A12):
- Administrative Rechte (Verwaltung, Mitarbeitende) gibt nur weiter, wer sie selbst hausweit hat.
- Niemand kann sich selbst eine Rolle mit Rechten geben, die er noch nicht hat.
- Sich selbst deaktivieren ist nicht möglich.
