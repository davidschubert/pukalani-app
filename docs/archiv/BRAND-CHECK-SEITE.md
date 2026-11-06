# Brand-Check als Produktseite — Start, Ranking, Vergleich, Verlauf (Konzept, 2026-09-05)

> **AUSGEFÜHRT 2026-09-05/06, ABGENOMMEN 2026-09-06** (David: Ranking, Vergleich,
> Ergebnisseite live getestet). Pakete P1–P6 (§9) sind auf branding.supply, Migration
> brand-017 gefahren. Davids Zuschnitte während des Baus: Kategorie-Karten in eigener
> Section und dauerhaft offen (kein Auf-/Zuklappen); Fazit als Bento; Befund-Liste
> nach Punktgewinn. Nicht live durchgespielt (Login + KI-Kosten): Dokument-Check,
> Neu-ermitteln, Korrektur-Annahme — per Route-Tests abgesichert. Erledigt-Eintrag:
> docs/OPEN-ITEMS-COMPLETE.md. Dieses Dokument ist Archiv, keine Arbeitsliste.

Davids Auftrag nach dem ersten gelungenen Live-Check (2026-09-05): „der brand-check
muss immer auf einer eigenen seite stattfinden … teaser verweisen immer auf diese
eine seite … ein brand-check archiv … ranking … zwei brands miteinander
vergleichen … wie die auto-quartett-karten." Grundlage: das gebaute Instrument
(docs/archiv/BRAND-CHECK.md — Katalog, Score, Tabelle `brand_checks`).

## 1 · Seitenarchitektur — EINE Adresse, drei Reiter

| Adresse | Was | Zugang |
| --- | --- | --- |
| `/brand-check` | **Start** — Formular oben, darunter die Erklärung (§2); für Eingeloggte zusätzlich „Meine Brands" (§5) | öffentlich, indexierbar (die SEO-Seite des Instruments) |
| `/brand-check/ranking` | **Ranking** — alle geprüften Auftritte, filter- und sortierbar (§3) | öffentlich, indexierbar |
| `/brand-check/vergleich?a=<id>&b=<id>` | **Vergleich** — zwei Checks links/rechts (§4) | öffentlich, `noindex` (Kombinationen sind unendlich) |
| `/brand-check/<id>` | Ergebnis (bleibt, wie gebaut) — bekommt Knöpfe „Vergleichen" und „Ins Ranking" | öffentlich, `noindex` |

Reiter-Navigation über `UTabs`-Optik als Links (jeder Reiter ist eine eigene
Adresse — teilbar, SSR, kein Zustand im Client). Heute antwortet
`/brand-check` 404, weil nur `[id].vue` existiert.

**Teaser werden Teaser:** die Brand-Check-Karte der Startseite verliert ihr
Formular und verlinkt auf `/brand-check` (Score-Ring-Vorschau + ein Satz + CTA);
About und Team bekommen denselben Teaser. Das Formular lebt genau einmal.

## 2 · Die Start-Seite (Formular + Marketing)

Reihenfolge nach Davids Aufzählung, Copy-Regeln wie überall (Markenberater statt
George, „ihr", breite Positionierung „Marke"):

1. **Hero mit Formular** — „Wie stark ist eure Marke? Website eintragen, in 20
   Sekunden wissen." (`BwBrandCheckForm`, unverändert).
2. **Was der Brand-Check ist** — 40 Kriterien, 8 Kategorien, 0–100, Aussen-Check
   der Startseite; ehrlich: „Reifegrad, kein Zeugnis".
3. **Warum es ihn gibt / warum das wichtig ist** — Marke wird von aussen wahr-
   genommen; die meisten sehen ihren Auftritt nie mit fremden Augen.
4. **Was ihr davon habt** — drei Befunde mit Beleg statt Bauchgefühl, kostenlos,
   ohne Konto, teilbar.
5. **Worauf er aufbaut** — die acht Kategorien mit Gewicht (dieselbe Liste wie
   die Ergebnisseite), 16 gerechnet + 24 vom Markenexperten beurteilt, Belegpflicht.
6. **Features** — Cache 7 Tage (dieselbe Antwort), Ranking, Vergleich, Verlauf.
7. **Und dann?** — „Euer neues Branding oder Rebranding lässt sich später
   ebenfalls durch den Check werfen" (Verlauf, §5); CTA „Marken-Relaunch starten"
   für Gäste und Konten OHNE Brand, „Meine Brands" für Konten MIT Brand.
8. **FAQ** (FAQPage-JSON-LD wie /about): Was wird gelesen? Werden Daten
   gespeichert? Warum nur die Startseite? Wie oft darf ich? Kann ich meine Site
   aus dem Ranking nehmen? Was heisst „nicht bewertbar"?

## 3 · Ranking („Archiv")

- **Datengrundlage:** `brand_checks` — je `urlKey` der JÜNGSTE Check (ältere
  bleiben Verlauf). Spalten in der Liste: Auftritt (Host), Score-Ring, Band,
  Branche, Datum, stärkste Kategorie.
- **Filter:** Branche, Band; **Sortierung:** Score (Standard), je Kategorie
  („die Besten in Konsistenz"), Datum. `UTable` (Davids B6-Regel), Paginierung.
- **Branche** gibt es heute nicht — sie wird im SELBEN Judge-Aufruf mitbestimmt
  (ein Feld `industry` aus einer geschlossenen Liste von ~16 Branchen, keine
  zweite KI-Anfrage, neue Spalte via Migration brand-017; Bestand = „unbekannt").
- **Recht:** ein öffentliches Ranking FREMDER Websites, die irgendjemand
  eingetragen hat, ist eine Bewertung Dritter. Bewertungen sind zulässig, wenn
  sie faktenbasiert sind (unsere Belege sind Zitate/Messwerte) und der Betroffene
  sich wehren kann — deshalb auf jeder Ergebnisseite ein „Betreiber? Eintrag
  entfernen"-Weg (Mail an uns, manuelles Ausblenden `hidden: true`). Wie weit
  das Ranking öffentlich ist, ist Davids Entscheidung (§8.1).
- **Kosten:** null KI — reine Leseansicht, Microcache 60 s (user-agnostisch).

## 4 · Vergleich („Quartett")

Zwei Checks nebeneinander: Kopf mit Host + Score-Ring links/rechts, darunter
acht Zeilen — Kategorie, Wert links, Balken gegeneinander, Wert rechts, der
höhere Wert farbig (`--bw-accent`), Gleichstand neutral. Unten: „A gewinnt 5 von
8 Kategorien." Auswahl: von jeder Ergebnisseite „Vergleichen mit …" (Suchfeld
über Hosts im Ranking), im Ranking zwei Zeilen anhaken → „Vergleichen". Rein aus
gespeicherten Zeilen, keine KI.

## 5 · Meine Brands + Verlauf (Eingeloggte)

- Kurzliste der eigenen Brands (Tabelle `brands`) mit letztem Score der
  hinterlegten Website; Knopf **„Brand-Score neu ermitteln"** umgeht den
  7-Tage-Cache (zählt gegen den Konto-Deckel, §8.4).
- **Gegenüberstellung** mit dem Vorgänger-Check derselben URL: je Kategorie
  ▲ besser / ▼ schlechter / = gleich, Gesamt-Delta, Datum beider Stände.
- **Experten-To-dos:** alle Kriterien < 2 als Liste, sortiert nach gewichtetem
  Abstand (heute zeigen wir drei — die Liste ist dieselbe Regel ohne Deckel),
  je mit Beleg und „nächster Schritt", der ins passende Wizard-Kapitel zeigt.
- Brands OHNE Website: der Check liest heute nur Websites. Ein Check des
  Fundament-DOKUMENTS (Judge-Modus „Dokument statt Seite", messbare Kriterien
  entfallen ⇒ eigener Score „Fundament-Reife") ist ein eigenes Paket (§8.3).

## 6 · Schutz und Kosten (unverändert + Ergänzung)

3/Tag je IP für Gäste, 200/Tag Instanz, 7-Tage-Cache bleiben. Neu: Konto-Deckel
für „neu ermitteln" (§8.4), Ranking/Vergleich kosten keine KI, `hidden`-Flag für
Entfernungswünsche, Ranking zeigt nur Checks mit Score (keine Fehlläufe).

## 7 · Pakete — siehe §9 (Bauplan nach der Fragenrunde)

## 3b · Korrekturvorschläge (Davids Idee, 2026-09-05 — „wie Google Business Profile")

Wer einen Fehler im Ranking sieht (falsche Branche, später mehr), schlägt eine
Korrektur vor; der Betreiber prüft im Dashboard und nimmt an oder lehnt mit
Begründung ab. Derselbe Workflow wie das Fehler-Melden auf pukalani.app (Ticket
erstellen → prüfen → abarbeiten), aber SCHLANK im brand-Layer statt über den
`tickets`-Layer: branding.supply fährt ihn nicht (extends: themes/admin/brand/
core/system), und er brächte für ein Feld vier Tabellen und ein Produkt mit.
- Tabelle `brand_check_corrections` (brand-017): checkId, field (heute nur
  `industry`), proposed, reason (freiwillig, ≤ 300), reporterEmail (freiwillig),
  status open/accepted/declined, decisionNote, decidedAt, ipHash.
- Öffentlich: `POST /api/brand/check/<id>/correction` (Honeypot, Drossel
  `brand:correction` 3/Std je IP).
- Betreiber: `/dashboard/brand-check/corrections` (users.manage wie die
  Warteliste): Liste, Annehmen (schreibt das Feld in `brand_checks`), Ablehnen
  mit Begründung; Zähler im Menü.
- Eigene Brands: der Besitzer korrigiert die Branche seiner Brand DIREKT
  (kein Vorschlag nötig — es ist seine Brand).

## 5b · Dokument-Check für Brands ohne Website (Davids Entscheidung: sofort mit)

- Quelle ist das Fundament-Dokument (bestätigte Feldwerte der Brand) statt einer
  Website. Die 16 messbaren Kriterien (Meta, HTML, HTTPS) gibt es dort nicht ⇒ sie
  fallen aus der Normalisierung, wie heute „nicht bewertbar". Die 24 beurteilten
  Kriterien bekommt der Judge mit dem Dokument als Material (derselbe Prompt-
  Bauer, Block `[brand foundation]` statt `[page text]`, Belege sind Zitate aus
  den Feldern). Ergebnis = **„Fundament-Reife"** (eigener `scoreVersion`
  `doc-score-1`, `source: 'document'`), damit Website- und Dokument-Scores nie
  in einer Zahl verglichen werden — im Ranking sind Dokument-Checks nur mit
  Opt-in des Besitzers und als eigene Spalte „Quelle" erkennbar.
- Adresse: derselbe `/brand-check/<id>`; die Ergebnisseite zeigt „Quelle:
  Fundament-Dokument, Stand <Datum>" statt der URL.
- Brands OHNE Website zeigen in „Meine Brands" beides: „Fundament prüfen" und
  „Website hinterlegen" (führt zur Startkarte, `websiteUrl`).
- Deckel: derselbe Konto-Deckel (10/Tag) — ein Dokument-Check ist ein KI-Aufruf.

## 8 · Entscheidungen — GETROFFEN (David, 2026-09-05, Fragenrunde)

1. **Ranking nur mit Opt-in des Prüfers.** Häkchen „ins Ranking aufnehmen" beim
   Check (Default AUS); ohne Häkchen bleibt der Check privat (Adresse teilbar,
   `noindex`, wie heute). Entfernen-Weg für Betreiber trotzdem (hidden-Flag).
   Verworfen: alle öffentlich; nur Eingeloggte.
2. **Branche = KI-Vorschlag im Judge-Aufruf** (feste Liste ~16), korrigierbar über
   den Korrekturvorschlag-Workflow (§3b); Besitzer eigener Brands korrigieren direkt.
3. **P1–P4 UND Dokument-Check sofort** (§5b); Brands ohne Website zeigen
   zusätzlich „Website hinterlegen".
4. **Konto-Deckel „neu ermitteln": 10/Tag je Konto**; Gäste bleiben bei 3/Tag je IP.

## 10 · Visualisierung — drei Zoomstufen derselben Daten (David, 2026-09-05)

Externer Input (Radar/Heatmap/Score-Cards) als Leitplanke am eigenen Modell
geprüft; festgezogen:
- **Score = Urteil:** Score-Ring mit Band und Delta zum Vorgänger („↑ +7").
- **Markenabdruck = Profil** (EN „Brand Fingerprint"): die 8 Kategorie-Werte als
  Netz mit 8 Achsen. Der Begriff ist das FEATURE — im UI nie „Radar" nennen
  (das ist nur die Technik). Inline-SVG aus `--bw-`-Tokens, kein Chart-Framework.
  Im Vergleich (P4) liegen zwei Markenabdrücke übereinander.
- **Ampel-Matrix 8 × 5 = Diagnose:** die 40 Kriterien als Zellen mit VIER
  Zuständen (0 rot · 1 bernstein · 2 grün · nicht bewertbar = Schloss). Bewusst
  KEINE 0–100-Heatmap je Kriterium: Kriterien sind 0/1/2, alles andere wäre
  Scheingenauigkeit. Dazu 8 Kategorie-Karten (Wert, Band-Wort), klickbar → die
  5 Kriterien der Kategorie.
- **Drei Befunde neu geschnitten: Stärke · Chance · Nächster Schritt** (statt
  „drei schwächste Kriterien"): Stärke = höchstes gewichtetes Kriterium mit
  Beleg („was funktioniert schon"), Chance = größter gewichteter Abstand zu 2
  („größter Hebel"), Nächster Schritt = die Chance übersetzt in das Wizard-
  Kapitel, das sie adressiert (Zuordnung Kategorie → Kapitel aus P5). Kette:
  Analyse → Erkenntnis → Empfehlung → Handlung → Relaunch.
- **Verworfen:** Treemap/Sunburst (Gewichte sind Konstanten), Radial Bars
  (Doppelung), Bullet-Chart gegen Benchmark (erst mit genug Ranking-Einträgen
  als Perzentil), fremde Kategorienamen (unser Katalog steht).

**P6 „Ergebnisseite v2"** (nach P5): Score + Delta → Markenabdruck → 8
Kategorie-Karten → Ampel-Matrix → Stärke · Chance · Nächster Schritt →
Report-per-Mail-CTA. Ersetzt die heutige Balken-Liste + zugeklappte 40er-Liste.

## 9 · Bauplan (aktualisiert)

| # | Paket | Braucht |
| --- | --- | --- |
| P1 | `/brand-check` Start-Seite mit Reitern, Marketing, FAQ + JSON-LD, Opt-in-Häkchen im Formular, Teaser-Umbau (Startseite/About/Team) | Davids Blick auf die Texte |
| P2 | Backend: Migration brand-017 (`industry`, `rankingOptIn`, `hidden`, `userId`, `profileId`, `source` auf `brand_checks`; Tabelle `brand_check_corrections`), Branche im Judge, Konto-Deckel + Cache-Umgehung, Ranking-API, Korrektur-Routen | Migration (Davids Ja) |
| P3 | Ranking-Seite (Filter/Sortierung/Kategorie-Bestenlisten), Korrektur-Formular + Dashboard-Warteschlange | P1+P2 |
| P4 | Vergleich (Quartett): zwei überlagerte Markenabdrücke + 8 direkte Kategorievergleiche; Einstiege aus Ergebnis und Ranking | P2 |
| P5 | Meine Brands, neu ermitteln, Gegenüberstellung (Score-Delta, Kategorie-/Kriterien-Änderungen), To-do-Liste, Dokument-Check | P2 |
| P6 | Ergebnisseite v2 (§10): Score+Delta, Markenabdruck, Kategorie-Karten, Ampel-Matrix, Stärke · Chance · Nächster Schritt | P4, P5 |
