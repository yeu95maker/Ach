# Einspringen 2.0 und Stationsstatus

Stand: 11.10.2026.

## Einspringen

1. Ein Dienst wird frei. Entweder schreibt die Leitung ihn aus (z. B. bei einer Krankmeldung über „Vertretung finden → Als offenen Dienst ausschreiben“), oder er ist im veröffentlichten Plan als offener Dienst angelegt.
2. **Benachrichtigt werden nur Kolleg:innen der Station, die den Dienst wirklich übernehmen können.** Das sind dieselben Regeln wie in der Liste „Wer kann übernehmen?“:
   - kein Urlaub und keine Krankmeldung an dem Tag
   - kein anderer Dienst, der sich überschneidet
   - mindestens 11 Stunden Ruhezeit davor und danach
   - kein Wunsch „nicht verfügbar“ für den Tag

   Wer nicht passt, wird nicht gestört. Sehen kann den offenen Dienst trotzdem jede:r auf der Station unter *Dienstplan → Offene Dienste*.
3. Mit **„Ich kann einspringen“** meldet man sich, ein Tipp genügt. Die Leitung bekommt eine Benachrichtigung.
4. Die Leitung sieht auf der Karte des Dienstes alle Meldungen mit Namen und tippt bei einer Person auf **„Bestätigen“**. Die Person wird eingetragen und benachrichtigt. Die anderen Meldungen werden automatisch abgesagt. Mit „Besetzen“ gibt es weiterhin die ausführliche Liste mit Ruhezeiten, Wünschen und Stunden im Monat.

Ohne Bestätigung der Leitung wird niemand eingetragen.

## Stationsstatus

Auf der Startseite zeigt die Karte **„Stationsstatus heute“** für die eigene Station (bei mehreren Stationen zum Umschalten):

- je Dienst (Früh, Spät, Nacht …): geplant gegenüber Soll. Rot heißt unter der Mindestbesetzung, Gelb unter dem Soll, Grün ausreichend.
- Anzahl der Krankmeldungen. Es wird nur die Zahl gezeigt, ohne Namen und ohne Grund.
- Anzahl der Personen im Urlaub. Das sehen nur Personen, die Urlaub einsehen dürfen (Leitung), alle anderen sehen „–“.
- offene Dienste, mit Link zur Liste.

Grundlage ist nur der **veröffentlichte** Plan. Die Soll- und Mindestbesetzung kommt aus den Besetzungsvorgaben der Station, die auch der Dienstplan-Editor nutzt.

## Technik

- Migration `20261014000300_cover_and_status.sql`:
  - `private.cover_candidates()` ist die gemeinsame Logik für die Kandidatenliste und die Benachrichtigung.
  - `private.suitable_cover_user_ids()` liefert die Empfänger der Benachrichtigung „offener Dienst“.
  - `public.get_ward_status(unit, date)` liefert den Stationsstatus und ist nur für Mitglieder der Station oder Planende zugänglich.
- Tests: `supabase/tests/09_cover_and_status.test.sql`, angepasst `04_team_lead.test.sql`, Unit-Test `wardShiftLevel`, Browsertest (Melden, Bestätigen, Stationsstatus).
