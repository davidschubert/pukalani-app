# Pukalani Studio: Erstgespräch-Wizard + Funnel-Ausbau (Plan)

**Stand: 2026-08-21 · Status: PLAN, noch nicht gebaut · App: `apps/portfolio` (pukalani.studio)**

Anlass (David, 2026-08-21): tobiasnase.de macht Neukundengewinnung über einen
konsequenten Direct-Response-Funnel und einen 5-Schritte-Erstgespräch-Wizard.
Wir wollen dasselbe Ziel — planbare, qualifizierte Anfragen — angepasst an die
Leistungen des Studios. Dieser Plan hält den Befund fest, sortiert nach der
Regel „Idee als Leitplanke, nicht kopieren" (bauen / Prinzip übernehmen /
später / ablehnen) und beschreibt den Wizard samt Plausible-Messung.

---

## 1 · Befund tobiasnase.de (Startseite, 2026-08-21 durchgeklickt)

Aufbau in dieser Reihenfolge — jede Sektion hat GENAU EINE Aufgabe im Funnel:

| # | Sektion | Funnel-Aufgabe |
| --- | --- | --- |
| 1 | Hero: „Planbar neue Kunden, ohne Kaltakquise" + EIN CTA | Ergebnis-Versprechen, kein Leistungskatalog |
| 2 | Zähler (Anfragen gesamt, verwaltetes Budget, Ø Anfragen/Kunde) | Sofort-Beweis in Zahlen |
| 3 | „Kommt dir das bekannt vor?" — 6 Schmerz-Karten | Problem-Spiegel: der Besucher erkennt SICH |
| 4 | „Was passiert, wenn …" — 3 nummerierte Folgen | Kosten des Nichtstuns |
| 5 | „Diese 6 Bausteine fehlen dir" | Diagnose-Rahmen: Lücken statt Feature-Liste |
| 6 | Leistungen: 4 Bereiche als Tabs + Detail-Grid | Angebot ERST NACH Problem und Diagnose |
| 7 | Vergleichstabelle: Wir ✓ / klassische Agentur ○ / Empfehlungen ✕ / Kaltakquise ✕ | Kategorie-Abgrenzung statt Anbieter-Vergleich |
| 8 | Ergebnisse: Metrik-Karten (Leads/Monat, €/Lead, Abschlüsse) + Zitat + Name/Firma/Region | Beweis mit ZAHLEN, nicht Adjektiven |
| 9 | Ehrlichkeits-Disclaimer („echte Ergebnisse, keine Garantie") | Glaubwürdigkeit, rechtlich sauber |
| 10 | WhatsApp-Screenshots | Roh-Beweis, bewusst unpoliert |
| 11 | „Ich bin der Nerd, der dein Marketing selbst baut" + tägliche Reels | Personenmarke: ein Umsetzer, kein Agentur-Ping-Pong |
| 12 | Team (2 Personen, Fotos) | Menschen statt Anonymität |
| 13 | Qualifizierung: „NICHT PASSEND ✕ / PASSEND FÜR UNS ✓" | Selbst-Selektion — filtert VOR dem Gespräch |
| 14 | FAQ (Einwände als Fragen) | Einwandbehandlung |
| 15 | Finaler CTA-Block | Ein Ziel, überall dasselbe: „Erstgespräch buchen" |

Durchgehende Muster: **ein einziges Conversion-Ziel** (jeder CTA führt zum
Erstgespräch, immer mit „✓ Kostenlos & unverbindlich" daneben), Rating-Zeile
„4.8/5 · über 50 Bewertungen" an jedem CTA, Du-Ansprache, dunkles Design.
Tracking: GTM/dataLayer, consent-gated (Cookie-Banner nötig — hier sind wir
mit cookielosem Plausible im Vorteil: kein Banner im Funnel).

## 2 · Befund Erstgespräch-Wizard (/erstgespraech, alle 5 Schritte durchlaufen)

Links eine Stepper-Sidebar mit den 5 Schritten + zwei Vertrauenszeilen
(„Dauer: ca. 3 Minuten" · „Deine Daten sind verschlüsselt und werden nur
intern verwendet"). Inline-Validierung je Schritt („Bitte wähle mindestens
eine Option"), Zurück/Weiter, Karten statt nackter Radios/Checkboxen — jede
Option trägt Titel + erklärende Unterzeile.

| Schritt | Fragt | Feldtypen | Verkaufs-Zweck |
| --- | --- | --- | --- |
| 1 „Dein Ziel" | Woran arbeiten? (4 Bereiche, Mehrfach) · Wunsch-Anfragen/Monat (4 Karten, inkl. „Weiß ich noch nicht") | Checkbox-/Radio-Karten | Bedarf + Ambition |
| 2 „Dein Geschäft" | Branche (Freitext) · Kernangebot (Freitext) · Werbebudget (Slider, Default 1.500 €/M) | Text + Slider | **Budget-Qualifizierung** ohne es „Preisfrage" zu nennen |
| 3 „Unternehmen" | Aufstellung (Solo … >20, 4 Karten) · Region (Freitext, „hilft beim Targeting") | Radio-Karten + Text | Projektgröße, Erreichbarkeit |
| 4 „Status & Erwartung" | Heutige Kanäle (6, Mehrfach) · Startzeitpunkt (Sofort / 1–3 Monate / Informativ) · Freitext optional | Karten + Textarea | **Reifegrad + Dringlichkeit** — trennt Käufer von Umschauern; Microcopy: „Wir sind ehrlich, falls wir nicht der richtige Hebel sind" |
| 5 „Kontakt" | Vor-/Nachname, Unternehmen, E-Mail, Telefon, DSGVO-Checkbox | klassisches Formular | Kontakt kommt ZULETZT — erst nach 4 Schritten Eigeninvestition (Commitment-Effekt); Zusage: „Wir melden uns innerhalb von 24 Stunden" |

Warum das funktioniert: der Wizard ist zugleich **Lead-Formular, Vorqualifizierung
und Gesprächsvorbereitung**. Wer durchklickt, hat investiert (bricht seltener ab),
und das Gespräch startet mit Budget, Ziel, Reifegrad und Zeitrahmen auf dem Tisch.

## 3 · Übertragung auf Pukalani Studio — bewusst sortiert

**(a) BAUEN — der Wizard selbst** (Abschnitt 4). Größter Hebel, fehlt uns komplett:
heute ist unser einziger Weg der direkte cal.com-Link — null Vorqualifizierung,
null Kontext im Gespräch, und wer (noch) nicht buchen will, hat keinen Weg.

**(b) PRINZIP übernehmen, eigene Form** — in die bestehende Startseite einarbeiten:
- **Problem-Spiegel vor Leistungskatalog.** Unsere Startseite steigt heute mit
  Leistungen ein. Eine Schmerz-Sektion aus Kundensicht davor („Website sieht gut
  aus, konvertiert aber nicht" · „Agentur zu träge, Freelancer zu schmal" ·
  „Relaunch verschleppt sich seit Monaten" …) — Texte aus unseren echten
  Projekten, nicht aus seinen.
- **Vergleichstabelle** „Pukalani Studio / klassische Agentur / Einzel-Freelancer /
  Baukasten-Tool" — passt exakt zu unserer Studio-Positionierung (Senior-Umsetzung
  ohne Agentur-Wasserkopf) und stützt den Wissen-Artikel „Freelancer oder Agentur".
- **Ergebnis-Zahlen in den Cases.** Unsere Case-Karten erzählen; seine beweisen
  (Leads/Monat, €/Lead). Je Case 1–3 Kennzahlen erheben (Conversion-Uplift,
  Ladezeit, Ranking, Umsatz) — nur echte Zahlen, sonst weglassen.
- **Selbst-Selektion** „Passt / passt nicht" — filtert Anfragen, auf die wir ohnehin
  nicht antworten wollen, und macht die Studio-Zielgruppe explizit.
- **Ehrlichkeits-Disclaimer** an den Ergebnissen — passt zu unserer Linie
  („nur Belegbares", vgl. Rechtstexte A1).
- **Ein Conversion-Ziel überall:** alle CTAs zeigen auf den Wizard,
  „✓ Kostenlos & unverbindlich" als feste Beistellzeile (CTA_NOTE erweitern).

**(c) SPÄTER** — erst wenn die Substanz da ist:
- Zähler-Sektion (wir haben noch keine aggregierbaren Studio-Zahlen),
- Bewertungs-Widget 4.8/5 (wir haben keine 50 Bewertungen — erfinden verboten),
- WhatsApp-/Roh-Feedback-Screenshots (sammeln, sobald vorhanden),
- Reels/Build-in-public-Sektion (nur mit echtem Kanal dahinter).

**(d) ABLEHNEN:**
- Du-Ansprache (unsere Site ist Sie-Form, B2B-DACH — bleibt),
- Meta-Ads-/Leadmaschinen-Versprechen (nicht unser Produkt),
- GTM + Cookie-Banner (Plausible bleibt cookielos — Wettbewerbsvorteil im Funnel),
- Budget-**Slider** in € pro Monat (bei Projektgeschäft irreführend — bei uns
  Projektbudget-**Spannen** als Karten, s. u.).

## 4 · Der Pukalani-Studio-Wizard (Konzept)

**Route:** `/erstgespraech` (en: gleicher Slug, Adressen bleiben einsprachig —
Konvention „Adresse bleibt einsprachig"; en-Titel „Intro call"). Eigene Seite im
`site`-Layout, 5 Schritte, Stepper-Sidebar, i18n de+en, Inhalte als
`app/data/erstgespraech.ts` (Localized-Paare wie überall).

**Schritte** (Feldnamen = spätere Plausible-Props):

1. **Ziel** — „Woran sollen wir arbeiten?" Mehrfachauswahl aus den sechs
   SERVICE_CORES-Karten (brand-design, ux-audit, landingpage-cro,
   corporate-website, saas-design, content-produktion) + „Weiß ich noch nicht —
   klären wir im Gespräch".
2. **Projekt** — Was existiert schon? (Neu / Relaunch / Optimierung Bestand /
   laufende Betreuung) · Branche (Freitext) · Projektbudget als Karten:
   „< 5 k € · 5–15 k € · 15–50 k € · > 50 k € · noch offen".
3. **Unternehmen** — Aufstellung (Solo/Selbstständig · 2–10 · 11–50 · > 50) ·
   Markt/Region (Freitext, „DACH" als Hinweis-Beispiel).
4. **Status & Zeitrahmen** — Wie entsteht die Website/das Produkt heute?
   (Agentur / Freelancer / intern / Baukasten / noch gar nicht) · Start
   (Sofort · 1–3 Monate · Informativ) · optionales Freitextfeld („Link zur
   bestehenden Seite?").
5. **Kontakt** — Name, Unternehmen, E-Mail, Telefon **optional** (weniger
   Hürde als bei Tobias; wir callen nicht kalt zurück), DSGVO-Checkbox →
   **Erfolgsseite mit direktem cal.com-Embed/Link**: statt „wir melden uns in
   24 h" kann der Lead den Termin SOFORT buchen — unser cal.com existiert
   schon, das ist der Punkt, an dem wir Tobias schlagen können. E-Mail-Zusage
   als Rückfallebene bleibt (CTA_NOTE: Antwort < 24 h).

**Technik (bewusst schlank, v1):**
- Nuxt-Seite + `POST /api/intro-call` in `apps/portfolio/server/api/` — Zod-Schema
  (create*Schema(t)-Factory), Honeypot-Feld, Rate-Limit-Bucket, createError-Konvention.
- Zustellung v1: `sendMail()` (core-Mailer) an mail@davidschubert.com mit allen
  Antworten strukturiert — **Voraussetzung: `NUXT_SMTP_*` auf der
  portfolio-Site setzen und in die Pflichtliste von `ops:site-env` eintragen**
  (F44-Lektion: eine fehlende Env wird nicht rot). Kein neues Datenmodell nötig.
- v2 (optional, eigener Beschluss): Tabelle `intro_requests` in der
  portfolio-Instanz (Migration idempotent über den zentralen Runner), damit
  Anfragen auch ohne Mail-Zustellung nie verloren gehen.
- Jeder Schritt liegt im Client-State (kein Server-Roundtrip vor Schritt 5);
  Zurück behält Antworten; Validierung je Schritt inline.

## 5 · Plausible: Funnel messbar machen (CE, ohne Cookies)

Unsere Instanz ist **Plausible CE** (self-hosted, plausible.hawaii.studio) —
die Funnels-UI der Cloud/EE gibt es dort NICHT. Der Funnel wird deshalb aus
**Custom Events als Goals** gebaut; Schritt-Vergleich = Conversion-Vergleich
der Goals (dieselbe Aussage, nur ohne hübsches Trichter-Diagramm):

| Event | Wann | Props |
| --- | --- | --- |
| `CTA Erstgespräch` | Klick auf irgendeinen Wizard-CTA | `source` (hero/band/footer/nav/case) |
| `Wizard Start` | Schritt 1 gerendert | — |
| `Wizard Step` | je abgeschlossenem Schritt | `step` (1–4) |
| `Wizard Submit` | Absenden Schritt 5 | `ziel` (Service-Keys), `budget` (Spanne), `start` (Timing) — **nie** Name/E-Mail/Freitexte (PII bleibt draußen) |
| `Cal Booking Click` | Klick auf cal.com auf der Erfolgsseite | — |

Dazu: Outbound-Klicks auf cal.com sind im v3-Snippet serverseitig schon
konfiguriert — der Ist-Zustand (Direktbuchungen ohne Wizard) ist damit ab
Tag 1 die Vergleichsbasis. Auswertung: Goal-Conversion je Event in der
Plausible-UI; Props beantworten „welche Leistung wird angefragt, welches
Budget, wie dringend" — das ist die Funnel-Sicht, die für Entscheidungen
zählt (wo brechen Leute ab: CTA→Start, Start→Step 4, Step 4→Submit,
Submit→Buchung). Implementierung über den bestehenden Analytics-Baustein des
analytics-Layers (kein zweites Script).

## 6 · Reihenfolge & Aufwand

| Paket | Inhalt | Aufwand | Braucht David? |
| --- | --- | --- | --- |
| W1 | Wizard-Seite + API + Mail + Erfolgsseite mit cal.com, alle CTAs umziehen, SMTP-Env auf portfolio | M | Texte/Budget-Spannen absegnen |
| W2 | Plausible-Events + Goals anlegen (Goals klickt David oder per API-Key) | S | Goal-Anlage in der Plausible-UI |
| W3 | Startseiten-Ausbau: Problem-Spiegel, Vergleichstabelle, Selbst-Selektion, Disclaimer | M | Schmerz-Texte gegenlesen |
| W4 | Cases um echte Kennzahlen ergänzen | S–M | **Ja: Zahlen liefern** |

**Entscheidungen GEFALLEN (David, 2026-08-21, strukturierte Fragen):**
1. Budget-Spannen: **< 5 k / 5–15 k / 15–50 k / > 50 k €** + „noch offen".
2. Telefon: **optional**.
3. Erfolgsseite: **beides** — cal.com-Sofortbuchung prominent, darunter
   „oder wir melden uns binnen 24 h" als Rückfallebene.
4. Speicherung: **Mail + Appwrite-Tabelle** `intro_requests` ab v1.

Zuschnitt der Tabelle (Architektur-Entscheidung beim Bau): `intro_requests`
ist APP-LOKAL in der portfolio-Instanz — kein Produkt-Layer, weil der Wizard
eine Eigenschaft DIESER Marketing-Site ist und nichts, was eine Community je
zuschaltet. Angelegt idempotent über `apps/portfolio/scripts/
ensure-intro-requests.mjs` (409 → skip); der Schema-Parity-Wächter meldet
unbekannte portfolio-Tabellen ohnehin nur als nicht-fatale Warnung.

## 7 · W3-Textentwürfe — ZUR FREIGABE (Claude, 2026-09-03)

Davids Gate für W3 ist das Gegenlesen der Schmerz-Texte. Hier der komplette
Entwurf (deutsch; EN folgt nach der Freigabe, damit nur eine Fassung im
Review liegt). Regeln: Wir-Stimme, nur Belegbares, Du-Ansprache wie auf der
Site, jeder CTA zeigt auf /erstgespraech.

### 7.1 Problem-Spiegel — „Kommt dir das bekannt vor?" (6 Karten)

1. **„Die Website sieht gut aus — bringt aber keine Anfragen."**
   Design ohne Strategie ist Dekoration. Es fehlt der Weg vom Besucher zur
   Anfrage.
2. **„Agenturen sprengen das Budget, Freelancer decken nur die Hälfte ab."**
   Für Strategie, Design UND Code brauchst du sonst drei Verträge — und
   koordinierst sie selbst.
3. **„Der Relaunch verschleppt sich seit Monaten."**
   Niemand treibt ihn, jeder wartet auf jeden — und die alte Seite verkauft
   derweil unter Wert.
4. **„Jede kleine Änderung braucht ein Ticket und drei Wochen."**
   Kurze Wege gibt es nur, wenn die Person, die entscheidet, auch baut.
5. **„Der Baukasten war schnell — jetzt bremst er bei allem, was zählt."**
   Sobald es speziell wird (Tempo, SEO, Anbindungen), zahlst du den
   Startvorteil doppelt zurück.
6. **„Viele Ansprechpartner, keiner verantwortlich fürs Ergebnis."**
   Zwischen Projektleitung, Designer und Entwickler versickert genau das,
   was du eigentlich kaufen wolltest.

### 7.2 Vergleichstabelle — Kategorie-Abgrenzung

Spalten: **Pukalani Studio · klassische Agentur · Einzel-Freelancer ·
Baukasten-Tool**. Ehrliche Marker (✓ trifft zu · ○ teils/abhängig · ✕ nein) —
keine Strohmänner, die Tabelle muss auch aus Agentur-Sicht fair lesbar sein.

| Kriterium | Studio | Agentur | Freelancer | Baukasten |
| --- | --- | --- | --- | --- |
| Strategie, Design und Code aus einer Hand | ✓ | ✓ | ○ | ✕ |
| Du sprichst direkt mit denen, die bauen | ✓ | ✕ | ✓ | — |
| Fester Preis vor Projektstart | ✓ | ○ | ○ | ✓ |
| Senior-Level ohne Agentur-Überbau | ✓ | ✕ | ○ | ✕ |
| Trägt auch Spezielles (Tempo, SEO, Anbindungen) | ✓ | ✓ | ○ | ✕ |
| Bleibt nach dem Launch ansprechbar | ✓ | ○ | ○ | ✕ |

### 7.3 Selbst-Selektion — „Passt das?"

**PASSEND FÜR UNS ✓**
- Du hast ein echtes Angebot und willst, dass es online so gut dasteht,
  wie es ist.
- Du willst EINEN Partner für Strategie, Design und Code — nicht drei
  Gewerke koordinieren.
- Du kannst Feedback und Inhalte beisteuern; wir treiben den Rest.
- Qualität ist dir einen fairen, vorher festen Preis wert.

**NICHT PASSEND ✕**
- „Nur schnell ein Logo" oder Design zum Stundensatz-Schnäppchen.
- Fertige Layouts 1:1 abtippen, ohne Gestaltungs- und Strategie-Spielraum.
- Deadline übermorgen für ein Projekt, das Substanz braucht.
- Ranking-Wunder über Nacht — seriös verspricht das niemand.

### 7.4 Ehrlichkeits-Disclaimer (an den Ergebnissen/Cases)

> Alle gezeigten Ergebnisse stammen aus echten Projekten. Sie sind
> Beispiele, keine Garantie — jedes Vorhaben startet mit eigenen
> Voraussetzungen, und genau darüber sprechen wir im Erstgespräch.

### 7.5 CTA-Beistellzeile (überall identisch)

„✓ Kostenlos & unverbindlich — ca. 3 Minuten" (bestehende CTA_NOTE
erweitern; KEINE erfundene Rating-Zeile — wir haben keine 50 Bewertungen,
und „nur Belegbares" gilt auch hier).

**Nach Freigabe:** Sektion Problem-Spiegel VOR die Leistungen, Tabelle +
Selbst-Selektion dahinter, Disclaimer an die Cases, EN-Fassung, Bau als
eigene Runde (M).
