# Diensttausch mit Genehmigung

Stand: 11.10.2026.

## Ablauf

1. **Anfragen:** Im Dienstplan öffnest du einen eigenen, veröffentlichten Dienst, der noch nicht begonnen hat, und tippst auf **„Dienst tauschen“**. Du hast zwei Möglichkeiten:
   - **Tauschen** gegen einen Dienst einer Kollegin oder eines Kollegen derselben Station, bis 14 Tage vor oder nach deinem Dienst
   - **Nur abgeben:** Die andere Person übernimmt, du bekommst keinen Dienst zurück.

   Optional kannst du eine kurze Nachricht mitschicken. Die Kollegin oder der Kollege bekommt eine Benachrichtigung.
2. **Zusagen:** Die gefragte Person sagt unter *Dienstplan → Diensttausch* zu oder lehnt ab. Bei einer Absage wirst du benachrichtigt.
3. **Genehmigen:** Nach der Zusage bekommt die Stationsleitung die Anfrage, also alle mit dem Recht „Dienstplan bearbeiten“ für die Station. Sie sieht beide Dienste und eventuelle Warnungen und tippt auf **Genehmigen** oder **Ablehnen**. Beim Ablehnen kann sie eine Begründung angeben.
4. **Erst nach der Genehmigung ändert sich der Dienstplan.** Beide bekommen genau eine Nachricht „Diensttausch genehmigt“. Ein geplantes „Frei“ an dem Tag wird ersetzt.

Solange noch nicht entschieden ist, kann man die eigene Anfrage zurückziehen. Ein offener Punkt erscheint als Zahl am Menüpunkt *Dienstplan*.

## Regeln

| Regel | Wirkung |
| --- | --- |
| Urlaub oder Krankmeldung an dem Tag | Der Tausch ist **nicht möglich**, die Person wird gar nicht erst angeboten. |
| Überschneidung mit einem anderen Dienst | **Nicht möglich** |
| Weniger als 11 h Ruhezeit davor oder danach | **Warnung**, die alle Beteiligten und die Leitung sehen |
| Wunsch „nicht verfügbar“ an dem Tag | **Warnung** |
| Eigener Tausch | Niemand kann einen Tausch genehmigen, an dem er selbst beteiligt ist. |
| Dienst hat begonnen | Die Anfrage gilt als „Abgelaufen“. |
| Plan hat sich zwischendurch geändert | Bei der Genehmigung wird alles neu geprüft. Passt es nicht mehr, kommt eine Meldung und die Leitung lehnt ab. |

Ein Dienst kann immer nur in **einer** offenen Anfrage stecken. Pro Person sind höchstens 10 offene Anfragen möglich.

## Zusammenspiel mit der automatischen Synchronisierung

Kommt der Dienstplan über die [Dienstwerk-Schnittstelle](SCHNITTSTELLE.md) aus einem anderen Dienstplanprogramm, muss der genehmigte Tausch **auch dort eingetragen werden**. Sonst zeigt die nächste Lieferung den alten Stand. Die Leitung sieht das in der Vorschau als Änderung und übernimmt es nur, wenn sie bestätigt. Eine automatische Rückmeldung an das Quellsystem gibt es noch nicht.

## Technik

- Migrationen `20261015000100_shift_swap_types.sql` (Status und Benachrichtigungstypen) und `20261015000200_shift_swap.sql`
  - Tabelle `shift_swaps` mit RLS: lesen dürfen nur die beiden Beteiligten und die Leitung der Station. Geschrieben wird nur über Funktionen.
  - `get_swap_options`, `request_shift_swap`, `respond_shift_swap`, `decide_shift_swap`, `cancel_shift_swap`, `get_shift_swaps`
  - Die Prüfungen stehen in `private.swap_issues()`. Der eigentliche Tausch läuft ohne kurzzeitige Doppelbelegung und ohne zusätzliche Benachrichtigungen wie „Dienstplan geändert“ oder „offener Dienst“.
- Tests: `supabase/tests/10_shift_swap.test.sql`, Unit-Tests `src/domain/swaps.test.ts`, Browsertest (Anfrage → Zusage → Genehmigung)
