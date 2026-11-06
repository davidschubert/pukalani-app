# Discover Brands — die öffentliche Markengalerie (Strategie + Konzept, 2026-09-08)

> **ARCHIV — AUSGEFÜHRT 2026-09-08/09: D0–D5 LIVE.** Krume & Gold und das Beispiel-Branding
> Kailua Coffee Co. (`/discover/kailua-coffee-co`, Badge „Beispiel", über den echten Wizard gebaut)
> sind öffentlich; D4 (Sitemap + robots.txt, OG-Bild je Anatomie, Branche als dritter
> Ähnlichkeits-Grund) ist mit `919f588c` live. Dieses Dokument ist Begründung und Rezept, KEINE
> Arbeitsliste — Erledigt-Eintrag mit Beweisen und Gelernt in OPEN-ITEMS-COMPLETE (DB1); Reste
> (Slug-301 bei Umbenennung, Rechtstexte als Gate fürs Öffnen) stehen in OPEN-ITEMS/DECISION-LOG.

OPEN-ITEMS 10 · DB1, von David vorgezogen („mach mit discover brands weiter",
2026-09-08). Grundlage: Phase-1-Plan „Discover-Seite" (Davids Idee 2026-08-27/29),
die Fünf-Ebenen-Karte (Discover → Audit → Compare → Build → Supply), der Klickdummy
aus Runde 97 (`packages/brand/.playground` → `/brand/demo/discover` + `/anatomie`),
die Leseansicht BF1 (Share-Snapshot, `buildBrandFoundation`) und die Datenlage
aus BC1/MV1. Weg nach WORKFLOW.md: dieses Konzept → Prototyp am Dummy → Freigabe
→ Pakete.

## 1 · Was Discover ist — und wofür (ein Absatz)

Die Galerie der Marken, die auf branding.supply gebaut wurden und deren
Eigentümer sie **freiwillig veröffentlicht** haben — jede mit ihrer Anatomie
(Purpose, Werte, Archetyp, Stimme, Farbwelt, Brand Score) als **indexierbare
Seite**. Für Besucher: Beispiele, wie ein Markenfundament aussieht. Für Kunden:
die Bühne für das eigene Ergebnis („Starte deine eigene" ist der einzige CTA an
fremden Marken). Für uns: die SEO-Maschine der Ebene „Discover" — jede
öffentliche Marke ist eine Seite mit echtem Inhalt. **Was Discover nicht ist:**
keine Vorlagen-Börse (kein Remix), keine Bewertungsplattform fremder Firmen (das
ist das Brand-Check-Ranking mit Opt-in des Prüfers), kein Creator-Marktplatz.

## 2 · Bestand, auf dem gebaut wird (nichts davon neu)

| Baustein | Stand | Für Discover |
| --- | --- | --- |
| Klickdummy Galerie + Anatomie | abgenommen (Runde 97/176: Kachel = Farbwelt, Brand of the Day als Fade-Carousel, Facetten Weiche/Archetyp/Stil/Positionierung, Anatomie als Dossier mit Steckbrief) | Form der Seiten |
| Share-Snapshot (BF1, `brand_shares`, `POST …/share`, `/brand/share/:token`) | live; friert Story + bestätigte Kapitel ein, filtert `sensitivity`, 30 Tage, `noindex` | **die Veröffentlichung IST ein Snapshot** — derselbe Renderer `buildBrandFoundation` |
| Foundation-Leseansicht `/brand/:id/foundation` | live (BF1 abgenommen 2026-09-07) | Anatomie = öffentliche Fassung davon |
| Brand-Check (BC1) | Website-Score + Fundament-Reife je Profil (`brand_checks.profileId`), Ranking-Opt-in | Score auf Kachel und Anatomie |
| Marktvergleich-Freigabe `brand_profiles.marketVisibility` (`private`/`shared`) | live | **getrennt lassen** (Plan: eigenes `publicationVisibility`) — eine Zustimmung gilt nur für das, wofür sie gegeben wurde |
| Farbwelt je Brand (`brandPalette.ts`, 12 Dreiklänge aus der Profil-Id) | live auf den Karten | Kachel-Farbe + Facette „Farbwelt" |
| Archetyp `d.primary`/`d.secondary` (12er-Katalog), Weiche `pathKind`, Branche `industry` (Freitext) + `a.category` | live | Facetten |
| Funnel `brand_events` | live | Aufruf-Zählung für „Trending" (Runde 2) |
| Nav-Punkt „Discover Brands" (i18n vorhanden, Link seit 404-Audit entfernt) | | kehrt mit der echten Seite zurück |

## 3 · Öffentlichkeit — die Regeln

1. **Opt-in je Brand, eigenes Feld** `brand_profiles.publicationVisibility`
   (`private` Default · `public`). Dieselbe Semantik wie `marketVisibility` und
   `rankingOptIn`: der Vorgabewert ist die Ablehnung, kein Wert entsteht ohne
   Klick.
2. **Veröffentlicht wird ein STAND, nicht der Live-Zustand:** „Veröffentlichen"
   friert einen Snapshot ein (dieselbe Regel wie der Share-Link, inkl.
   `sensitivity`-Filter — `a.competitors`, `a.complaints`, `a.challenge`, `a.facts`
   reisen nie). Später erneut veröffentlichen ⇒ neuer Stand. Zurückziehen ⇒
   Seite 404 (kein 410, kein Rest).
3. **Voraussetzungen zum Veröffentlichen:** Titel, Kapitel A und B abgenommen
   (sonst ist die Anatomie leer), Archetyp gesetzt (d.primary bestätigt) —
   dieselbe „Behauptungs"-Logik wie die Marktvergleich-Sperre.
4. **Moderation — FREIGABE VOR VERÖFFENTLICHUNG (David, §9.1):** „Veröffentlichen"
   erzeugt eine Veröffentlichung im Zustand `pending`; öffentlich wird sie erst,
   wenn der Betreiber sie freigibt (`published`), abgelehnt mit Begründung
   (`declined`, der Kunde sieht sie), später ausgeblendet (`hidden`) oder vom
   Kunden zurückgezogen (`withdrawn`). Der Kunde sieht den Zustand in der
   Leseansicht und auf der Brands-Karte („Wartet auf Freigabe"). Ein neuer
   Stand (erneutes Veröffentlichen) geht wieder durch die Freigabe; bis dahin
   bleibt der freigegebene alte Stand öffentlich. Dazu öffentliches „Melden"
   auf jeder Anatomie (Grund, Honeypot, Drossel — Muster Korrekturvorschläge).
5. **Recht:** Eigene Kunden-Inhalte mit ausdrücklicher Zustimmung; keine
   Personen (Creator-Profile bleiben aus, AH-7), keine fremden Logos. Der
   Nutzungsrahmen (Recht zur Veröffentlichung, Widerruf) gehört in die AGB —
   **A1 Rechtstexte ist damit ein Gate für die Öffnung an fremde Nutzer**, nicht
   für den Bau (Beta = Davids eigene Brands + eingeladene Tester).
6. **Kein Remix.** Der einzige CTA an einer fremden Marke: „Starte deine eigene".

## 4 · Die Seiten

### 4.1 Galerie `/discover` (indexierbar)

Nach dem Dummy: Kopf „Discover Brands · Marken, gebaut mit eurem persönlichen
Markenberater" (Copy-Regel), **Brand of the Day** (Betreiber-Kuration, Fade-
Carousel; ohne Kuration die drei neuesten), **Facetten**: Weiche (Neue Marke /
Relaunch), Archetyp (12), Farbwelt (12 Dreiklänge), Branche (aus `industry`,
normalisiert über den 16er-Katalog des Brand-Checks — Freitext ⇒ „Sonstiges"),
**Sortierung**: Neueste (Default), Brand Score, Fundament-Reife; „Bewertung" und
„Trending" erst in Runde 2 (§7). Kachel = Farbwelt + Wortmarke + Score-Ring +
Meta-Zeile (Branche · Weiche · Archetyp); Rebrands tragen den Badge „Relaunch"
(Vorher/Nachher-Slider braucht Bildmaterial — Produkt 02, nicht hier). Leerer
Zustand: „Noch keine veröffentlichte Marke — die erste könnte eure sein."
UTable-frei (Galerie ist Gestaltung, keine Datenliste); Query-Parameter für
Facetten/Sortierung (teilbar); Microcache 60 s auf der API.

### 4.2 Anatomie `/discover/<slug>` (indexierbar, JSON-LD `Organization`? — nein: `CreativeWork`/`Article`-frei, nur `WebPage` + BreadcrumbList)

Dossier nach dem Dummy: Hero in der Farbwelt (Wortmarke, Purpose-Satz, Score-
Ring mit Band), sticky **Steckbrief** (Branche · Weiche · Archetyp + Rest ·
Stimme · Positionierung · Sprache · Veröffentlicht), dann das Fundament aus dem
Snapshot über `buildBrandFoundation` (Story, Purpose/Vision/Mission, Werte,
Archetyp, Stimme, Messaging — die Kapitel, die der Snapshot trägt; visuelle
Kapitel bleiben gesperrt wie in der Leseansicht), **Markenabdruck** aus dem
jüngsten Check (falls vorhanden) mit Link zur Ergebnisseite, „Ähnliche Marken"
(gleicher Archetyp oder gleiche Farbwelt, max. 4 — die Facetten, die nur wir
haben), CTA „Starte deine eigene", „Melden". Slug = aus dem Titel, eindeutig
je Instanz, bleibt stabil (Umbenennung ⇒ neuer Slug + 301 vom alten).

### 4.3 Veröffentlichen (Kunde) — in der Leseansicht `/brand/:id/foundation`

Knopf „Veröffentlichen" neben Teilen/Export: Dialog mit Vorschau der
Steckbrief-Daten, Häkchen „Ich darf diese Marke veröffentlichen und weiß, dass
sie nach Freigabe öffentlich und indexierbar ist", Ergebnis = Zustand „Wartet
auf Freigabe" mit der künftigen Adresse `/discover/<slug>`. Nach Freigabe:
„Öffentlich · seit …" mit Link; nach Ablehnung: die Begründung des Betreibers
und „Erneut einreichen". Später: „Stand aktualisieren" (neuer Snapshot, erneut
durch die Freigabe), „Zurückziehen". Zustand auch auf der Brands-Übersichtskarte.

### 4.4 Betreiber — `/dashboard/discover` (users.manage)

Reiter **Warteschlange** (pending: Vorschau der Anatomie, Freigeben / Ablehnen
mit Begründung ≤ 300 Zeichen), **Veröffentlicht** (Titel, Slug, Stand, Score,
Meldungen; Featured setzen/entfernen — Brand of the Day = Featured mit Datum;
Ausblenden mit Begründung), **Meldungen** (offen/erledigt). Zähler im Menü wie
bei der Warteliste. Muster: Waitlist/Korrekturen-Seiten.

## 5 · Daten (Migration brand-020 — Nummer beim Anlegen gegen `origin/main` prüfen)

- `brand_profiles`: `publicationVisibility` (varchar 16, Default `private`) +
  Index — analog `marketVisibility`.
- Tabelle **`brand_publications`** (eine je Brand, rowId = profileId):
  `slug` (unique), `title`, `snapshot` (MEDIUMTEXT, dieselbe Form wie
  `brand_shares.snapshot`), `publishedAt`, `updatedAt`, `pathKind`, `industry`
  (normalisiert), `archetype`, `archetypeSecondary`, `paletteId`, `locale`,
  `checkId` (jüngster Check bei Veröffentlichung, nur Adresse), **`status`**
  (`pending` · `published` · `declined` · `hidden` · `withdrawn`), `decisionNote`
  (≤ 300, Ablehnungs-/Ausblende-Begründung), `decidedAt`, `submittedAt`,
  `featuredAt` (datetime|null), `reportCount`, `example` (boolean, Default false —
  das redaktionelle Beispiel-Branding, Badge „Beispiel"). Indizes: `uq_slug`,
  `idx_status_published` (status, publishedAt), `idx_featured`, `idx_archetype`,
  `idx_palette`.
- Tabelle **`brand_publication_reports`**: publicationId, reason (≤300),
  reporterEmail (opt.), status open/done, ipHash — Muster Korrekturen.
- Kein Seitentext, keine Rohantworten (Snapshot ist gefiltert wie der Share).

## 6 · Schutz

Öffentliche Routen `GET /api/discover` (Facetten/Sortierung/Seite, Microcache
60 s) und `GET /api/discover/<slug>` (Microcache 60 s; 404 bei hidden/privat);
`POST /api/discover/<slug>/report` (Honeypot, Drossel 3/Std je IP, Tages-Eimer).
Veröffentlichen/Zurückziehen nur Eigentümer (`requireBrandAccess` + Besitz),
Drossel 10/Tag je Konto. Betreiber-Routen users.manage. Log-Regel: Slug, Score,
Codes — nie Inhalte.

## 7 · Bewusst nicht in Runde 1

Nutzer-Bewertung (Klarheit/Mut/Handwerk — braucht Konten + Anti-Spam), Trending
(Aufruf-Metrik aus `brand_events`, Fenster 7 Tage), Collections, Creator-
Profile (AH-7-Kehrtwende, eigene Entscheidung), Vorher/Nachher-Slider (Produkt
02), Perzentil je Kategorie (erst mit genug Einträgen), Cases als
Judge-Referenzmaterial, Stil-/Positionierungs-Facetten (im Dummy, aber die
Daten `Stil` gibt es erst mit Brand Design 02; `b.positioningCategory` ist offen
formuliert — als Facette erst nach Normalisierung).

## 8 · Pakete — siehe §9 (Bauplan nach der Fragenrunde)


## 9 · Entscheidungen — GETROFFEN (David, 2026-09-08, Fragenrunde)

1. **Moderation: Freigabe VOR Veröffentlichung** (gegen die Empfehlung „sofort +
   Ausblenden"): Warteschlange beim Betreiber, Zustände `pending` → `published` /
   `declined` (mit Begründung), dazu `hidden` und `withdrawn` (§3.4).
2. **Adresse `/discover` + `/discover/<slug>`**; `/brands/<slug>` bleibt den
   Insights-Seiten externer Marken vorbehalten.
3. **Score: Website-Score, sonst Fundament-Reife**, beide klar beschriftet,
   Sortierung getrennt.
4. **Startinhalt: eigene Brands PLUS Beispiel-Branding „Kailua Coffee Co."** als
   redaktionell markierter Eintrag (Badge „Beispiel"). Es braucht ein echtes
   Fundament — Paket D5 baut es über den Wizard (echte Sessions, Davids Konto,
   bezahlte KI-Aufrufe im Rahmen der Drosseln) statt als handgeschriebenen
   Datensatz: so ist das Beispiel zugleich ein Beweis des Produktwegs.

### Prototyp-Abnahme D0 (David, 2026-09-08) — vier weitere Entscheidungen

5. **Kachel mit zwei Zahlen:** Brand Score gewinnt den Ring, die Fundament-Reife
   steht als kleine Zweitzeile („Fundament-Reife 78"); nur eine Zahl ⇒ diese.
6. **Brand of the Day: genau eine, letzte gewinnt** — Server-Regel beim Setzen
   von `featuredAt` (das vorige Featured wird gelöscht), Betreiber-Seite zeigt
   die aktuelle hervorgehoben; die Galerie blättert bei Bedarf die drei
   neuesten Veröffentlichungen, nicht mehrere Featured.
7. **Teilen auf dem Telefon = das native Teilen-Blatt** (Davids Wunsch: „wie
   die iPhone-Share-Funktion"): `navigator.share` mit Titel + Adresse, wo es
   ihn gibt (Leseansicht-Share-Link, später die öffentliche Discover-Adresse und
   die Brand-Check-Ergebnisseite); ohne Web Share API bleibt „Link kopieren".
   „Veröffentlichen" selbst wandert auf kleinen Bildschirmen ins Export-Menü
   (erreichbar, aber eine bewusste Entscheidung, kein Schnellklick).
8. **D0 abgenommen** — D1 startet. Nach Empfehlung gesetzt: leerer Zustand
   ersetzt die Wand; „Ausblenden" mit Begründungs-Dialog wie „Ablehnen";
   „Ähnliche Marken" mit fester Regel-Beschriftung; Farbwelt-Namen in den
   Katalog (de+en).

### Bauplan (aktualisiert)

| # | Paket | Braucht |
| --- | --- | --- |
| D0 | Prototyp: Dummy an das Konzept angleichen (Facetten Weiche/Archetyp/Farbwelt/Branche, Sortierung Neueste/Score/Reife, Score-Beschriftung, Anatomie mit Snapshot-Kapiteln, Veröffentlichen-Dialog mit Zustand „Wartet auf Freigabe", Betreiber-Warteschlange als Skizze) | Davids Abnahme |
| D1 | Migration brand-020 (`publicationVisibility`, `brand_publications` mit `status`, `brand_publication_reports`), Veröffentlichen/Zurückziehen (Routen + Dialog), Slug-Regel, Zustandsanzeige | Migration (Davids Ja) |
| D2 | Galerie `/discover` + Anatomie `/discover/<slug>` (nur `published`), Nav-Punkt, Teaser auf der Startseite | D1 |
| D3 | Betreiber-Seite `/dashboard/discover`: Warteschlange (freigeben/ablehnen mit Begründung), Featured/Brand of the Day, Ausblenden, Meldungen; öffentliches Melden | D1 |
| D4 | „Ähnliche Marken", Sitemap, OG-Bild je Anatomie | D2 |
| D5 | Beispiel-Branding „Kailua Coffee Co." über den Wizard anlegen, veröffentlichen, als Beispiel markieren — ✅ 2026-09-08 (zwei Opus-Läufe in Davids Chrome; Befund-Schleife `53be8792` dabei gefixt) | D1–D3, Davids Konto |
