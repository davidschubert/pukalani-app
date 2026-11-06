# Brand-Check — das kostenlose Instrument (Konzept, 2026-09-05)

> **AUSGEFÜHRT 2026-09-05** — Katalog (`packages/brand/shared/brandCheck.ts`),
> Messung, Judge, Routen, Tabelle `brand_checks` (Migration brand-016 gefahren),
> Formular auf der Startseite und Ergebnisseite `/brand-check/<id>` sind live
> auf branding.supply. Die drei Entscheidungen in §7 hat David so getroffen:
> Hybrid-Zugang (Score sofort, Report per Mail über die Warteliste), mit
> diesem Kriterien-Entwurf gebaut (Wortlaut jederzeit nachschärfbar), Ergebnis
> teilbar mit `noindex`. Die Deckel aus §5 gelten unverändert. Der Satz
> „17 messbar, 23 beurteilt" am Ende von §3 war ein Zählfehler des Entwurfs —
> die Liste selbst hat 16 **M** und 24 **K**, und so ist es gebaut (der Test
> nagelt `BRAND_CHECK_JUDGED_IDS` auf 24). Erledigt-Eintrag: docs/OPEN-ITEMS-COMPLETE.md. Dieses Dokument ist Archiv,
> keine Arbeitsliste.

Grundlage: BRAND-WIZARD-PHASE-1.md → „Brand Score" (Bewertungsmodell v2,
2026-08-29) und „Startseite + Perplexity-Analyse" (Audit-first-Akquise,
Korrektur 2026-08-30: der Check gilt dem BESTEHENDEN Auftritt, also der
Relaunch-Seite der Weiche). Dieses Dokument macht daraus ein baubares
Instrument und formuliert die 40 Prüfkriterien aus (Phase-2-Aufgabe).

## 1 · Was der Check tut (ein Satz)

Website angeben → wir lesen die Startseite (bestehender, SSRF-sicherer
`fetchBrandSite`, ≤ 20.000 Zeichen Text + Kopf-Metadaten) → 40 Kriterien in
8 Kategorien werden bewertet → **Brand Score (0–100) mit Band, 8 Kategorie-
Werte, die 3 wichtigsten Befunde** — jeder Befund mit Beleg (Zitat oder
Messwert) und dem nächsten Schritt. Reifegrad, kein Zeugnis.

## 2 · Fundiert statt gefühlt — zwei Sorten Kriterien

**Messbar (deterministisch, ohne KI):** aus HTML/Kopf gerechnet, immer gleich.
**Beurteilt (KI mit 0/1/2-Regel + Pflicht-Beleg):** Modell bekommt Kriterium,
Regel und Text; antwortet JSON `{score: 0|1|2, evidence: "<Zitat ≤ 160 Z.>",
note: "<ein Satz>"}`; Temperatur 0, Anbieter mit Zero-Data-Retention (dieselbe
Routing-Regel wie der Wizard), strikte Schema-Prüfung, ungültige Antwort ⇒
Kriterium „nicht bewertbar" (zählt nicht, wird gezeigt).

Reproduzierbarkeit: dieselbe URL innerhalb von 7 Tagen ⇒ derselbe gespeicherte
Check (kein zweiter KI-Aufruf) — das ist zugleich der Kosten-Deckel.

## 3 · Die 40 Prüfkriterien (Entwurf zum Gegenlesen)

Gewichte v2: Eigenständigkeit 15 · Visuelle Identität 15 · Konsistenz 15 ·
Markenerlebnis 15 · Positionierung & Klarheit 10 · Emotionale Wirkung 10 ·
Anpassungsfähigkeit 10 · Handwerk 10. Je Kategorie 5 Kriterien à 0–2 (Rohwert
0–10 → aufs Gewicht normalisiert). **M** = messbar, **K** = KI-beurteilt.
„Stufen-bewusst": was von aussen NICHT prüfbar ist, wird nicht geraten, sondern
als „nicht von aussen prüfbar" ausgewiesen und aus der Normalisierung genommen.

### A · Eigenständigkeit (15)
1. **K** Der erste Satz sagt etwas, das nur diese Marke sagen kann (0 = austauschbar, 1 = branchentypisch mit Eigenheit, 2 = eigen).
2. **K** Der Name/Claim ist unverwechselbar, kein Gattungsbegriff (0/1/2).
3. **K** Kein Floskel-Vokabular („innovativ", „ganzheitlich", „Premium") in Hero und Einleitung (0 = ≥3 Floskeln, 1 = 1–2, 2 = 0).
4. **K** Ein erkennbarer Standpunkt oder eine Haltung ist formuliert (0 = keiner, 1 = angedeutet, 2 = klar).
5. **K** Bildsprache/Metaphern sind eigen statt Stock-Motive (aus Alt-Texten/Bildunterschriften/Überschriften; 0/1/2).

### B · Visuelle Identität (15)
6. **M** Favicon + `og:image` vorhanden (0 = keins, 1 = eins, 2 = beide).
7. **M** Konsistente Überschriften-Hierarchie (genau ein h1, h2 folgen; 0 = kein/mehrere h1, 1 = h1 aber Sprünge, 2 = sauber).
8. **K** Bilder/Alt-Texte beschreiben eine erkennbare Bildwelt (nicht „image1.jpg"; 0/1/2).
9. **M** Farb-/Theme-Meta gesetzt (`theme-color`, `color-scheme`; 0/1/2).
10. **K** Wort- und Bildwelt passen zusammen (Ton der Texte ↔ beschriebene Motive; 0/1/2). *Stufen-Hinweis: Layout/Typografie sind von aussen nur per Screenshot prüfbar — Phase 2.*

### C · Konsistenz (15)
11. **K** Ein Ton durch die ganze Seite (Anrede du/Sie/ihr konsistent, Register stabil; 0/1/2).
12. **M** `<title>`, `og:title` und h1 sagen dasselbe (0 = widersprechen, 1 = teilweise, 2 = deckungsgleich).
13. **K** Versprechen im Hero deckt sich mit dem, was die Seite darunter beschreibt (0/1/2).
14. **M** Sprache deklariert und konsistent (`lang`-Attribut passt zum Text; 0/1/2).
15. **K** Name der Marke wird einheitlich geschrieben (Gross-/Kleinschreibung, Kürzel; 0/1/2).

### D · Markenerlebnis (15)
16. **M** Es gibt eine klare Handlungsaufforderung (Link/Button mit Verb in der ersten Bildschirmhöhe; 0/1/2).
17. **K** Der nächste Schritt für Besucher ist eindeutig (eine Hauptaktion statt fünf; 0/1/2).
18. **M** Auffindbarkeit/SEO-Basis: `title` 30–65 Z., `description` 70–160 Z. (0 = beides fehlt/falsch, 1 = eins, 2 = beide) — *unser Alleinstellungs-Kriterium*.
19. **M** GEO-Readiness: strukturierte Daten (JSON-LD `Organization`/`WebSite`) vorhanden (0/1/2 nach Vollständigkeit).
20. **K** Kontakt/Vertrauen sichtbar (Impressum/Kontakt/Über-uns erreichbar, echte Absender; 0/1/2).

### E · Positionierung & Klarheit (10)
21. **K** In 10 Sekunden verständlich: WAS wird angeboten (0 = unklar, 1 = erschliessbar, 2 = sofort).
22. **K** FÜR WEN ist es — die Zielgruppe wird benannt oder ist unmissverständlich (0/1/2).
23. **K** Der Purpose-/Kern-Satz ist kurz und aktiv (≤ 20 Wörter, aktives Verb; 0/1/2).
24. **K** Abgrenzung: „anders als …" ist erkennbar, ohne Wettbewerber zu beschimpfen (0/1/2).
25. **M** Keine Fachjargon-Dichte: Anteil Wörter ≥ 14 Zeichen in Hero+Einleitung (0 = > 12 %, 1 = 6–12 %, 2 = < 6 %).

### F · Emotionale Wirkung (10)
26. **K** Die Seite spricht ein Gefühl an, nicht nur ein Feature (0/1/2).
27. **K** Es gibt eine Geschichte oder einen Ursprung (warum es die Marke gibt; 0/1/2).
28. **K** Menschliche Stimme statt Behördenton (Ich/Wir-Perspektive, konkrete Bilder; 0/1/2).
29. **K** Ein Moment der Überraschung/Eigenwilligkeit (eine Zeile, die man weitersagt; 0/1/2).
30. **K** Ton passt zur Kategorie (kein Vertriebston für einen Verein, kein Behördenton für ein Café; 0/1/2).

### G · Anpassungsfähigkeit (10)
31. **M** Mobile-Viewport gesetzt (0/2).
32. **M** Dark-Mode-Bereitschaft (`color-scheme` oder `prefers-color-scheme` im CSS-Kopf; 0/1/2).
33. **K** Kern-Botschaft funktioniert auch als Einzeiler (Title/OG-Title trägt sie allein; 0/1/2).
34. **M** Soziale Vorschau vollständig (`og:title`+`og:description`+`og:image`; 0/1/2).
35. **K** Sprache der Marke funktioniert in kurzen UND langen Formaten (Buttons/Labels vs. Absätze im selben Ton; 0/1/2).

### H · Handwerk (10)
36. **M** Rechtschreibung/Zeichensetzung: doppelte Leerzeichen, fehlende Umlaute-Kodierung, `&amp;`-Reste (0 = ≥3 Funde, 1 = 1–2, 2 = 0).
37. **M** Kein Platzhalter-Text („Lorem ipsum", „Hier steht", „TODO"; 0/2).
38. **M** HTTPS + gültige Weiterleitung http→https (0/2).
39. **K** Sätze im Hero ≤ 25 Wörter, keine Schachtelsätze (0/1/2).
40. **M** Meta-Hygiene: kein doppelter `title`, `description` einmal, `canonical` gesetzt (0/1/2).

Verhältnis: 17 messbar, 23 beurteilt. Ein Check kostet damit EINEN
JSON-KI-Aufruf (alle K-Kriterien in einem Prompt, Antwort als Array mit
Pflicht-Belegen) statt 23.

## 4 · Ergebnis

- **Score-Kopf:** Ring (BwScoreRing), Zahl, Band („Stark"), „Stand: Aussen-Check
  der Startseite, <Datum>".
- **8 Kategorie-Balken** mit Gewicht; nicht prüfbare Kriterien als Schloss.
- **3 Befunde:** die drei Kriterien mit dem grössten gewichteten Abstand zu 2,
  je: Titel · Beleg (Zitat/Messwert) · „Nächster Schritt" (ein Satz, der in den
  Wizard zeigt — der Score verkauft die To-dos).
- **Weg weiter:** „Marken-Relaunch starten — euer Markenberater kennt euren
  Auftritt schon" (der Check-Score wird Ausgangspunkt der Rebrand-Story,
  Plan-Vormerkung) und „Vollständigen Report per Mail" (→ Warteliste-DOI mit
  `source: brand-check`, Report als Anhang folgt in Phase 2).
- Ergebnis-Adresse `/brand-check/<id>` (teilbar, `noindex` bis zur
  Badge-Entscheidung), 7 Tage gecacht je URL.

## 5 · Schutz und Kosten

- Öffentliche Route ohne Konto (Plan) — dafür: **3 Checks/Tag je IP**
  (Muster `brand:analyze`), **Instanz-Deckel 200 Checks/Tag** (eigener Eimer,
  `brandAiQuota` kind `check`), **URL-Cache 7 Tage** (gleiche Host+Pfad ⇒
  gespeicherter Check, 0 KI-Kosten), Honeypot, SSRF-Grenzen aus
  `brandSiteFetch` (keine privaten Netze, Redirect-Deckel, Timeout).
- Tabelle `brand_checks` (server-only): url, host, locale, score, band,
  categories (JSON), criteria (JSON mit Belegen), findings (JSON), textHash,
  model/promptVersion, ipHash (sha256 mit Tages-Salt, nur für Deckel),
  createdAt. Kein Rohtext der Seite gespeichert (Plan §9b: Rohmaterial früh
  löschen) — nur Belege ≤ 160 Zeichen.
- Log-Regel §6: URL-Host, Score, Dauer, Fehlercode — nie Seitentext.

## 6 · Abgrenzung (bewusst nicht in Runde 1)

Mehrseiten-Crawl · Screenshot-basierte Layout-/Typo-Prüfung · Vergleich mit
Wettbewerbern (Benchmark = Scout, Schicht 7) · Score-Verlauf (Monitoring) ·
Badge/Zertifikat · Perzentil je Kategorie (Discover).

## 7 · Entscheidungen für David

1. **Zugang:** Score sofort ohne Anmeldung (Plan) — und der vollständige
   Report nur gegen Mail (Warteliste)? → Empfehlung: ja, dieses Hybrid.
2. **Kriterien-Katalog:** mit diesem Entwurf bauen (Katalog liegt als pure
   Datei, Wortlaut jederzeit nachschärfbar) — oder erst gegenlesen?
3. **Deckel:** 3/Tag je IP, 200/Tag Instanz, 7-Tage-Cache — passt?
