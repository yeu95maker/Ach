# Offene Punkte, Annahmen und Rückfragen

Die Vorgabe lautete: keine stillen Annahmen. Wo eine Entscheidung nötig war, um weiterzuarbeiten, ist sie hier dokumentiert. **Bitte bestätigen oder korrigieren.**

## A. Rückfragen (Entscheidung durch Fachbereich nötig)

| # | Frage | Aktuelle Annahme |
| --- | --- | --- |
| A1 | ~~Rollenzuordnung~~ **Entschieden (10.10.2026):** „Charge Nurse“ = Schichtleitung. | Umgesetzt: `charge_nurse` = Schichtleitung, `head_nurse` = Stationsleitung (Scope Station) bzw. PDL (Scope Abteilung/Haus). |
| A1a | Passen die **Rechte der Schichtleitung**? | Pflegekraft + Krankzeiträume der Station (ohne Kommentar) + Kontaktdaten des Teams. Sie darf eine Krankmeldung „zur Kenntnis nehmen“ (wer den Anruf annimmt), aber nichts genehmigen, veröffentlichen oder im Plan ändern. |
| A1b | Ist es in Ordnung, dass Stationsleitung und PDL **eine Rolle mit unterschiedlichem Scope** sind? Oder braucht die PDL eigene Rechte, z. B. hausweite Auswertungen? | Eine Rolle. Bei Bedarf lässt sich eine eigene Rolle `nursing_director` ohne Code ergänzen. |
| A2 | Wer darf den **Kommentar einer Krankmeldung** lesen? | Die betroffene Person, Stationsleitung und PDL. **Nicht** Schichtleitung, HR, Hospital-Admin oder Systemadmin. |
| A3 | ~~Krank/Urlaub für Kollegen sichtbar?~~ **Entschieden (10.10.2026):** Kollegen sehen, **wer krank ist**, aber **nicht, wer im Urlaub ist**. | Umgesetzt über die View `colleague_sick_leaves`: nur Person und Zeitraum, kein Grund oder Kommentar, kein Status. Sichtbar nur für Kollegen der **eigenen Station(en)**, bestätigt am 10.10.2026. |
| A4 | Sehen Pflegekräfte die **Dienstpläne anderer Stationen**? | Ja, veröffentlichte Pläne des eigenen Hauses (für „Kollegen im Dienst – Ganzes Haus“). Lässt sich per Policy auf eigene Stationen beschränken. |
| A5 | Darf die Stationsleitung **eigenen Urlaub** genehmigen? | Nein. Das übernimmt die nächsthöhere Ebene (PDL). |
| A6 | Wie weit rückwirkend darf man sich **krank melden**? | Höchstens 30 Tage. |
| A7 | **Urlaubsanspruch / Resturlaub** und Feiertage pro Bundesland? | Nicht im MVP. Arbeitstage werden als Mo–Fr ohne Feiertage gezählt. |
| A8 | Sollen Benachrichtigungen bei Krankmeldungen an **alle** mit `sick_leave.view` gehen (inkl. HR)? | Ja, an alle mit diesem Recht im Scope. HR erhält dabei nur Name und Zeitraum. |
| A9 | ~~Offene Dienste selbst übernehmen?~~ **Entschieden (10.10.2026):** Interesse melden. | Umgesetzt: „Ich kann einspringen“, die Leitung entscheidet (siehe LEITUNG-UND-VERWALTUNG.md). |
| A10 | **SSO pro Krankenhaus** (Entra-ID-Tenant oder SAML) statt globalem Google- und Microsoft-Login? | Global konfiguriert. Für den Unternehmenseinsatz empfohlen: SAML-SSO pro Haus (Supabase Pro) und Einschränkung des Azure-Tenants. |
| A11 | Muss ein Urlaubsantrag eine **Vorlaufzeit** einhalten? | Keine Regel. Beginn ab heute. Ein Setting `leave.min_notice_days` ist vorgesehen. |
| A12 | **Rollenvergabe:** Ist die neue Regel richtig? Administrative Rechte gibt nur weiter, wer sie selbst hat. Niemand gibt sich selbst neue Rechte. Die alte Regel („nur Rollen, deren Rechte man komplett selbst hat“) hat HR und Administration sogar die Pflegekraft-Rolle verwehrt. | Umgesetzt. HR kann damit z. B. eine Stationsleitung ernennen, die Krankmeldungs-Kommentare lesen darf, obwohl HR selbst sie nicht lesen kann. |
| A13 | Soll die Leitung auf dem Dashboard weiterhin die Zahl **neuer Krankmeldungen** sehen? | Ja, dezent: Sie muss eine Vertretung organisieren. Für alle anderen ist die Krankmeldung aus dem Vordergrund entfernt. |
| A14 | „Nachrichten an das Team“: Reicht **Aktuelles mit Push**, oder braucht es zusätzlich **Direktnachrichten oder Chat**? | Aktuelles mit Kategorien und Push ist umgesetzt. Ein Chat wäre eine eigene Funktion (Datenschutz, Aufbewahrung). |
| A15 | Wer darf in **Aktuelles** für das ganze Haus senden? | Wer `announcements.publish` hausweit hat: PDL mit Hausscope und Krankenhaus-Administration. Stationsleitungen senden an ihre Station. |

## W. Wunschplan – Rückfragen

| # | Frage | Aktuelle Annahme |
| --- | --- | --- |
| W1 | ~~Wer darf einreichen?~~ **Entschieden (10.10.2026):** Pflegekräfte, Stationsleitung und stellvertretende Stationsleitung, nicht HR. | Umgesetzt. Neue Rolle `deputy_head_nurse` (stellvertretende Stationsleitung). |
| W1a | ~~Rechte der stellvertretenden Stationsleitung?~~ **Entschieden (10.10.2026):** dieselben Rechte wie die Stationsleitung, dauerhaft für ihre Station. | Umgesetzt. |
| W2 | ~~„Nicht verfügbar“ harter Ausschluss?~~ **Entschieden (10.10.2026):** Nein, starker Wunsch. | Umgesetzt (keine Sperre beim Einplanen, Widerspruch wird rot markiert). |
| W3 | ~~Standardwerte?~~ **Entschieden (10.10.2026):** Frist 21 Tage vor Monatsbeginn, Erinnerung 3 Tage vorher, kein Limit für Wunschfrei. | Umgesetzt (Seed und Hausstandard angepasst). |
| W4 | Planungszeitraum immer ein Kalendermonat? | Die Oberfläche legt Monate an, die Datenbank erlaubt Zeiträume bis 62 Tage (z. B. 4-Wochen-Pläne). |
| W5 | Sollen Kolleg:innen sehen, wie viele Wünsche es für einen Tag gibt (ohne Namen)? | Nein, fremde Wünsche sind unsichtbar. |
| W6 | ~~Automatische Bewertung nach Veröffentlichung?~~ **Entschieden (10.10.2026):** Nein. | Die Bewertung bleibt manuell. |

## B. Technische offene Punkte

| # | Punkt | Status |
| --- | --- | --- |
| B1 | Native Apps (Capacitor) inkl. APNs/FCM-Versand in `push-dispatch` | Architektur vorbereitet, nicht umgesetzt |
| B2 | Biometrischer Login (Keychain/Keystore-Adapter für `AuthStorage`) | Schnittstelle vorhanden, Adapter fehlt |
| B3 | UI für MFA (TOTP) | In Auth aktiviert, UI fehlt |
| B4 | Skript zur Rotation des Vault-Schlüssels | Vorgehen dokumentiert (SECURITY.md) |
| B5 | ~~Admin-Oberflächen~~ | **Umgesetzt** (`/admin`). Offen: eigene Rollen anlegen (`roles.manage`), Qualifikationen pflegen, Hauseinstellungen. Für die Einladung muss die Edge Function `invite-employee` deployt sein (inkl. `APP_URL`). |
| B6 | ~~Dienstplan-Editor~~ | **Umgesetzt** (siehe DIENSTPLAN-EDITOR.md). Offen: Vorlagen/Kopieren, Oberfläche für Mindestbesetzung, weitere Planungsregeln. |
| B7 | `supabase gen types` statt handgeschriebener Row-Typen (`src/data/rows.ts`) | Sobald die CLI im CI verfügbar ist |
| B8 | Dokumente: Upload-UI (Krankmeldung mit AU, Zertifikate) | Tabelle, Storage und Policies fertig |
| B9 | Offline-Fähigkeit (Service-Worker-Cache des Dienstplans) | Nicht im MVP |
| B10 | Partitionierung von `audit_logs` und `notifications`; Aufbewahrungsfristen (Löschkonzept DSGVO) | Bei Bedarf. Die Fristen muss der Datenschutz festlegen. |
| B11 | Rechtstexte (Impressum, Datenschutzerklärung, AV-Vertrag), Hosting-Region EU (Frankfurt) | Organisatorisch |
| B12 | ~~Mitteilungen erstellen (UI)~~ | **Umgesetzt** als „Aktuelles“ mit Kategorien, Terminen und Push |
| B13 | Oberfläche für die Wunschplan-**Hauskonfiguration** (`wish_plan_settings`: Limits, Standardfrist, Erinnerung) | Tabelle und RLS fertig. Frist und „Änderungen erlaubt“ sind pro Zeitraum in der UI einstellbar. |
| B14 | Planungsassistent (KI) | Datenbasis (`get_scheduling_context`), Besetzungsvorgaben und Vorschlagstabelle sind vorbereitet, der Assistent selbst nicht |

## C. Umgesetzte Annahmen ohne Rückfragebedarf
- Woche beginnt am Montag (ISO 8601). Zeiten werden immer in der Zeitzone des **Krankenhauses** angezeigt.
- Du-Form in allen Sprachen.
- Standardsprache Deutsch, Fallback Deutsch. Sprache und Darstellung werden im Profil gespeichert und gelten geräteübergreifend.
- Profilbilder werden auf 512 px verkleinert und als WebP gespeichert.
