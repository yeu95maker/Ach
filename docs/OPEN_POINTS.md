# Offene Punkte, Annahmen und Rückfragen

Die Vorgabe lautete: keine stillen Annahmen. Wo eine Entscheidung nötig war, um weiterzuarbeiten, ist sie hier dokumentiert. **Bitte bestätigen oder korrigieren.**

## A. Rückfragen (Entscheidung durch Fachbereich nötig)

| # | Frage | Aktuelle Annahme |
| --- | --- | --- |
| A1 | ~~Rollenzuordnung~~ **Entschieden (10.10.2026):** „Charge Nurse“ = Schichtleitung. | Umgesetzt: `charge_nurse` = Schichtleitung, `head_nurse` = Stationsleitung (Scope Station) bzw. PDL (Scope Abteilung/Haus). |
| A1a | Passen die **Rechte der Schichtleitung**? | Pflegekraft + Krankzeiträume der Station (ohne Kommentar) + Kontaktdaten des Teams. Sie darf eine Krankmeldung „zur Kenntnis nehmen“ (wer den Anruf annimmt), aber nichts genehmigen, veröffentlichen oder im Plan ändern. |
| A1b | Ist es in Ordnung, dass Stationsleitung und PDL **eine Rolle mit unterschiedlichem Scope** sind? Oder braucht die PDL eigene Rechte, z. B. hausweite Auswertungen? | Eine Rolle. Bei Bedarf lässt sich eine eigene Rolle `nursing_director` ohne Code ergänzen. |
| A2 | Wer darf den **Kommentar einer Krankmeldung** lesen? | Die betroffene Person, Stationsleitung und PDL. **Nicht** Schichtleitung, HR, Hospital-Admin oder Systemadmin. |
| A3 | ~~Krank/Urlaub für Kollegen sichtbar?~~ **Entschieden (10.10.2026):** Kollegen sehen, **wer krank ist**, aber **nicht, wer im Urlaub ist**. | Umgesetzt über die View `colleague_sick_leaves`: nur Person und Zeitraum, kein Grund oder Kommentar, kein Status. Annahme: nur Kollegen derselben Station(en). Ist eine hausweite Sicht gewünscht? |
| A4 | Sehen Pflegekräfte die **Dienstpläne anderer Stationen**? | Ja, veröffentlichte Pläne des eigenen Hauses (für „Kollegen im Dienst – Ganzes Haus“). Lässt sich per Policy auf eigene Stationen beschränken. |
| A5 | Darf die Stationsleitung **eigenen Urlaub** genehmigen? | Nein. Das übernimmt die nächsthöhere Ebene (PDL). |
| A6 | Wie weit rückwirkend darf man sich **krank melden**? | Höchstens 30 Tage. |
| A7 | **Urlaubsanspruch / Resturlaub** und Feiertage pro Bundesland? | Nicht im MVP. Arbeitstage werden als Mo–Fr ohne Feiertage gezählt. |
| A8 | Sollen Benachrichtigungen bei Krankmeldungen an **alle** mit `sick_leave.view` gehen (inkl. HR)? | Ja, an alle mit diesem Recht im Scope. HR erhält dabei nur Name und Zeitraum. |
| A9 | Dürfen Pflegekräfte **offene Dienste** selbst übernehmen? | Im MVP werden sie nur angezeigt. Ein Workflow „Interesse melden / übernehmen“ ist eine eigene Funktion. |
| A10 | **SSO pro Krankenhaus** (Entra-ID-Tenant oder SAML) statt globalem Google- und Microsoft-Login? | Global konfiguriert. Für den Unternehmenseinsatz empfohlen: SAML-SSO pro Haus (Supabase Pro) und Einschränkung des Azure-Tenants. |
| A11 | Muss ein Urlaubsantrag eine **Vorlaufzeit** einhalten? | Keine Regel. Beginn ab heute. Ein Setting `leave.min_notice_days` ist vorgesehen. |

## B. Technische offene Punkte

| # | Punkt | Status |
| --- | --- | --- |
| B1 | Native Apps (Capacitor) inkl. APNs/FCM-Versand in `push-dispatch` | Architektur vorbereitet, nicht umgesetzt |
| B2 | Biometrischer Login (Keychain/Keystore-Adapter für `AuthStorage`) | Schnittstelle vorhanden, Adapter fehlt |
| B3 | UI für MFA (TOTP) | In Auth aktiviert, UI fehlt |
| B4 | Skript zur Rotation des Vault-Schlüssels | Vorgehen dokumentiert (SECURITY.md) |
| B5 | Admin-Oberflächen: Mitarbeiter einladen (Edge Function vorhanden), Stationen, Schichttypen, Rollen | Backend und RLS fertig, UI folgt mit der Admin-Phase |
| B6 | Dienstplan-Editor für Leitungen (Dienste anlegen/ändern) | Backend fertig (RLS, Doppelbuchungsschutz, Trigger). Die UI kann im MVP nur veröffentlichen. |
| B7 | `supabase gen types` statt handgeschriebener Row-Typen (`src/data/rows.ts`) | Sobald die CLI im CI verfügbar ist |
| B8 | Dokumente: Upload-UI (Krankmeldung mit AU, Zertifikate) | Tabelle, Storage und Policies fertig |
| B9 | Offline-Fähigkeit (Service-Worker-Cache des Dienstplans) | Nicht im MVP |
| B10 | Partitionierung von `audit_logs` und `notifications`; Aufbewahrungsfristen (Löschkonzept DSGVO) | Bei Bedarf. Die Fristen muss der Datenschutz festlegen. |
| B11 | Rechtstexte (Impressum, Datenschutzerklärung, AV-Vertrag), Hosting-Region EU (Frankfurt) | Organisatorisch |
| B12 | Mitteilungen erstellen (UI) | RLS und Trigger fertig, im Dashboard nur Anzeige |

## C. Umgesetzte Annahmen ohne Rückfragebedarf
- Woche beginnt am Montag (ISO 8601). Zeiten werden immer in der Zeitzone des **Krankenhauses** angezeigt.
- Du-Form in allen Sprachen.
- Standardsprache Deutsch, Fallback Deutsch. Sprache und Darstellung werden im Profil gespeichert und gelten geräteübergreifend.
- Profilbilder werden auf 512 px verkleinert und als WebP gespeichert.
