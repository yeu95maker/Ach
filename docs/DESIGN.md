# Designsystem

Inspiration: Apple, Linear, Notion, Stripe. Ruhig, hochwertig, vertrauenswürdig – nicht wie klassische Krankenhaussoftware.

## Tokens (`src/styles/index.css`)
Alle Farben sind **semantische Tokens** als CSS-Variablen. Komponenten verwenden nie Hex-Werte direkt. Dark Mode hat eine **eigene** Palette (tiefes Blau-Schwarz, aufgehellte Akzente für Kontrast) und ist keine Invertierung.

| Token | Light | Dark | Verwendung |
| --- | --- | --- | --- |
| `primary` | #0F3D91 | #3D74E8 | Hauptaktionen, aktive Navigation |
| `accent` | #18B7B0 | #2FD0C8 | Urlaub, Fokusring, positive Hervorhebung |
| `success` | #1F9D55 | #3DBF74 | Genehmigt, Bestätigung |
| `warning` | #E8890C | #F2A33A | Offen, wichtig |
| `danger` | #D93A3A | #F06363 | Krank, Ablehnen, Fehler |
| `bg / surface / surface-2` | #F5F7FB / #FFF / #F0F3F8 | #090E18 / #111A2B / #172236 | Ebenen |

**Farbcodierung Dienste** (`components/dayKindStyles.ts`, eine Quelle für die gesamte App): Früh = Amber, Spät = Violett, Nacht = Nachtblau, Urlaub = Türkis, Krank = Rot, Frei = Grau. Jede Kategorie hat zusätzlich ein Icon (Sonnenaufgang, Sonnenuntergang, Mond, Palme, Thermometer, durchgestrichener Kalender). Farbe ist deshalb nie der einzige Informationsträger.

Farbe wird sparsam eingesetzt: Flächen sind neutral, und Farbe markiert Bedeutung (Status, Dienstart).

## Typografie
Inter Variable, selbst gehostet (DSGVO: kein Google-Fonts-CDN). Seitentitel 28–34 px bold mit engem Tracking, Kartentitel 17 px semibold, Fließtext 15 px, Metadaten 13 px. Zahlen werden tabellarisch gesetzt (`tabular`).

## Komponenten (`src/ui`)
- **Button:** `primary`, `secondary`, `soft`, `accent`, `ghost`, `danger` in den Größen 40/48/56 px. Zustände: Hover (Farbe), Pressed (`scale .98` + dunkler), Disabled (45 % Deckkraft, keine Pointer-Events), Loading (Spinner, `aria-busy`).
- **Card:** Radius 20 px, feiner Rand, zweistufiger weicher Schatten. Interaktive Karten heben sich beim Hover um 2 px.
- **Sheet:** natives `<dialog>` (Fokusfalle, Esc, Screenreader). Auf dem Phone ein Bottom-Sheet mit Griff, auf Tablet und Desktop ein zentrierter Dialog.
- **SegmentedControl:** iOS-Stil mit gleitendem Indikator.
- **Field/Input:** 48 px hoch, 16 px Schrift (kein iOS-Zoom), deutlicher Fokusring in Türkis.
- **Skeletons, EmptyStates, Toasts** (`aria-live`) für jeden Lade-, Leer- und Fehlerzustand.

## Bewegung
Einblenden, Aufsteigen und Skalieren mit 220–340 ms und weicher Ease-Out-Kurve. Listen erscheinen gestaffelt (45 ms pro Element, maximal 8 Stufen). Der Live-Status „läuft gerade“ pulsiert dezent. `prefers-reduced-motion` schaltet alle Animationen ab.

## Responsive
| Breite | Layout |
| --- | --- |
| < 768 px (Phone) | Inhalt + schwebende Tab-Bar mit Blur, Bottom-Sheets, Monatsansicht mit kompakten Kürzeln |
| 768–1024 px (Tablet) | Icon-Rail links, zweispaltige Karten |
| ≥ 1024 px (Desktop) | Seitenleiste mit Haus, Navigation, dauerhaften Schnellaktionen und Profil; dreispaltiges Dashboard |

## UX-Regeln
- Jede wichtige Funktion ist in höchstens drei Klicks erreichbar (siehe [ARCHITECTURE.md → Navigation](ARCHITECTURE.md#navigation--3-klicks)).
- Die Krankmeldung ist auf Stress ausgelegt: Voreinstellungen „Heute / 2 Tage / 3 Tage“, ein Absende-Button und eine klare Erfolgsbestätigung.
- Sprache: Du-Form, kurz und freundlich. Fehlermeldungen sagen, was zu tun ist.
- Barrierefreiheit: semantische Landmarks, Skip-Link, `aria-label` für Icon-Buttons, Fokusringe, Kontraste nach WCAG AA, Touch-Ziele ≥ 44 px.
