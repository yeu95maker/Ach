# ShiftCare – Demo

Alle Aufnahmen stammen aus der echten App mit echter Datenbank, Rechten und Benachrichtigungen. Die Daten sind die Demo-Daten aus `supabase/seed.sql`.

## Videos (je ca. 45 Sekunden, mit Untertiteln)

| Pflegekraft am Smartphone | Stationsleitung am Desktop |
| --- | --- |
| [![Video Pflegekraft](video-pflegekraft-poster.png)](demo-pflegekraft-smartphone.webm) | [![Video Stationsleitung](video-stationsleitung-poster.png)](demo-stationsleitung-desktop.webm) |
| [▶ Video ansehen](demo-pflegekraft-smartphone.webm): Dashboard, Dienstplan, Wunschplan, Urlaub, Team, Profil, Dark Mode | [▶ Video ansehen](demo-stationsleitung-desktop.webm): Urlaub genehmigen, Krankmeldung, Wunschpläne, Dienstplan-Editor, Veröffentlichen |

> GitHub spielt `.webm` direkt im Browser ab: Video anklicken und dann „View raw“ bzw. „Download“ wählen.

## Dashboard
![Dashboard der Stationsleitung](dashboard-desktop.png)

## Dienstplan
| Monatsansicht (Dark Mode) | Antippen: Details & Kollegen im Dienst |
| --- | --- |
| ![Dienstplan](dienstplan-desktop-dark.png) | ![Dienstdetails](dienstdetails-mobil-dark.png) |

## Wunschplan
| Wünsche eintragen (Smartphone) | Übersicht für die Dienstplanung |
| --- | --- |
| ![Wunschplan](wunschplan-mobil.png) | ![Wunschpläne](wunschplaene-matrix.png) |

## Dienstplan-Editor
![Dienstplan-Editor](dienstplan-editor.png)

![Zelle im Detail: geplant vs. Wunsch](dienstplan-editor-details.png)

## Anträge, Krankmeldung, Profil
| Urlaubsanträge genehmigen | Krankmeldung (Smartphone) | Profil (Dark Mode) |
| --- | --- | --- |
| ![Urlaubsanträge](urlaubsantraege.png) | ![Krankmeldung](krankmeldung-mobil.png) | ![Profil](profil-mobil-dark.png) |

## Selbst ausprobieren
- **Lokal:** siehe [README → Schnellstart](../README.md#schnellstart-lokal-mit-supabase-cli)
- **Online:** Live-Demo über GitHub Pages, siehe [Live-Demo einrichten](#live-demo-einrichten-github-pages)

Demo-Zugänge (Passwort `ShiftCare!2026`): `anna.becker@shiftcare.dev` (Pflegekraft), `jonas.weber@shiftcare.dev` (Schichtleitung), `mira.schulz@shiftcare.dev` (Stationsleitung), `paul.richter@shiftcare.dev` (PDL).

## Live-Demo einrichten (GitHub Pages)
Der Workflow `.github/workflows/demo-pages.yml` baut die App und veröffentlicht sie auf GitHub Pages. Als Backend dient das Supabase-Projekt `shiftcare-demo` (Frankfurt) mit allen Migrationen und den Demo-Daten. URL und Anon-Key sind im Workflow hinterlegt. Sie sind öffentlich gedacht, weil sie ohnehin in der App landen, und der Schutz liegt in den RLS-Regeln. Ein anderes Projekt lässt sich über die Secrets oder Variablen `DEMO_SUPABASE_URL` und `DEMO_SUPABASE_ANON_KEY` einstellen.

Einmalig nötig:
1. **Settings → Pages → Source: GitHub Actions** wählen.
2. Unter **Actions → „Demo (GitHub Pages)“ → Run workflow** den Workflow starten. Die Demo läuft dann unter `https://yeu95maker.github.io/Ach/`.
3. In Supabase unter **Auth → URL Configuration** die Pages-URL als Site-URL eintragen. Das ist für den Passwort-Reset nötig.
