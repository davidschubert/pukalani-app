# Products-Seite auf branding.supply (PS1) — Konzept

Status: **AUSGEFÜHRT 2026-09-09** — Konzept entschieden (§8), Prototyp = die
echten Seiten im Worktree (Port 3017), von David freigegeben, gebaut, auf `main`
(Commits 0d3c9c26 · 7ec39e34 · 83bff531 · 68e31fee), Deploy-Beweis in
[OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md). Archiv, keine Arbeitsliste.
Arbeitsablauf: [WORKFLOW.md](../referenz/WORKFLOW.md). Auftrag im Wortlaut: DECISION-LOG
2026-09-08 (BI1, „Nebenbefund, entschieden: die Products-Seite wird ein eigenes
Vorhaben").

---

## 1. Auftrag

Übersicht plus **je eine Marketing-Seite pro Produkt**, Namen aus den
Manifesten, je Produkt **entweder ein Preis oder der Weg ins Erstgespräch**
(`/erstgespraech`, lebt im brand-Layer). Der Nav-Punkt „Products" kehrt **erst
mit den Seiten** zurück (Regel des 404-Audits vom 2026-09-03 in
`BwSiteNav.vue`: nur echte Ziele). Verworfen: den Nav-Punkt vorab auf einen
Anker zeigen zu lassen.

## 2. Bestand (was heute wirklich existiert)

| Klickdummy-Kind (`brand.nav.product.*`) | Ebene (Karte 2026-09-05) | Heute | Route | Zugang / Preis-Lage |
|---|---|---|---|---|
| `score` — Brand-Check | Audit | **live** (Ranking, Vergleich, Methodik) | `/brand-check` | frei, ohne Konto |
| `benchmark` — Marktvergleich | Compare | **live** (Werkstatt-Seite, Schranke) | `/brand/:id/market` | Schranke „Preis im Erstgespräch", Beta-Konten frei; Betrag 149 € netto je Branding („Ableitung") entschieden 2026-09-09, **erscheint vor Z1 nirgends** |
| `wizard` — Brand Foundation | Build | **live** (Wizard + Leseansicht BF1) | `/brand/:id/foundation` | frei; geschlossene Beta (Einladungscode / Warteliste) |
| `design` — Brand Design | Build | **live seit 2026-09-09** (Produkt 02) | `/brand/:id/design` | Studio-begleitet, Freischaltung je Marke durch den Betreiber, **kein Preis** (G4, BRAND-DESIGN.md §1.8) |
| `book` — Book & Kit | Supply | **in Konzeption** (BK1, parallel) | — | Teil der „Ableitung"; Wortlaut und Anzeige fallen in BK1/Z1 — PS1 entscheidet hier keinen Preis |
| `experience` — Brand Experience | Supply | **nicht gebaut, kein Plan** | — | — |
| `monitoring` — Brand Monitoring | Discover | **nicht gebaut**; die Discover-Ebene ist heute `/discover` (Galerie) + BI1 Brand Insights (Redaktion, eigener Nav-Punkt später) | — | — |

Außerhalb der Produkt-Liste, aber Belege: `/discover` (öffentliche
Brandings), `/beispiel/kailua-coffee` (Beispiel-Branding), `/brand-check/ranking`.

Ton-Vorlage: `apps/branding/app/pages/index.vue` (Wir-Stimme, „euer
Markenberater" statt George in Marketing-Copy — DECISION-LOG 2026-09-04),
`about.vue`, `team.vue`. Kundenkreis B2B, Preise netto (BS1 §9 Zeile 9).

## 3. Vorschlag Übersicht (`/products`)

Reihenfolge **entlang der fünf Ebenen** Audit → Compare → Build → Supply,
d. h. entlang des Kundenwegs (erst prüfen, dann vergleichen, dann bauen, dann
liefern):

1. **Brand-Check** (Audit) — frei
2. **Brand Foundation** (Build) — frei, Beta
3. **Marktvergleich** (Compare) — Ableitung, Beta frei
4. **Brand Design** (Build) — Erstgespräch
5. **Brand Book & Kit** (Supply) — folgt / Erstgespräch

Foundation vor Marktvergleich, obwohl Compare in der Karte vor Build steht:
der Marktvergleich setzt eine abgenommene Foundation voraus (`requires:
['brand']`, §2.4 des Marktvergleich-Plans) — die Seite soll den Weg zeigen,
den ein Kunde wirklich gehen kann.

Dazu (Davids Entscheidung 2026-09-09, gegen die Empfehlung „weglassen"):
**Brand Experience** und **Brand Monitoring** als **abgeblendete
„kommt"-Karten ohne Link** am Ende der Übersicht — die volle Suite bleibt
sichtbar, ohne Seite und ohne Datum. Sie bekommen KEINE Produktseite und
KEINEN Nav-Eintrag. **Brand Insights** ist kein Produkt, sondern Redaktion —
eigener Nav-Punkt mit BI1.

Kopf der Übersicht: ein Satz zur Karte („Prüfen, vergleichen, bauen, liefern
— fünf Ebenen, ein Markendokument"), darunter die Produkt-Karten (Nuxt-UI
`UPageGrid` + `UPageCard`: Icon, Name, Ebene als Eyebrow, ein Satz aus dem
Manifest-`description`, Preis-Zeile, Link zur Produktseite).

## 4. Produktseite (`/products/<slug>`) — ein Screen

Gleicher Aufbau für alle fünf (Vorlage: Startseite, Wir-Stimme):

1. **Hero** — Eyebrow „Ebene · Products", Name, ein Satz Nutzen, primärer CTA.
2. **Was ihr bekommt** — drei bis vier Punkte (aus Manifest/Plan, keine Erfindung).
3. **So funktioniert es** — drei Schritte.
4. **Beleg** — ein echter Link: Brand-Check → `/brand-check/ranking`;
   Foundation → `/beispiel/kailua-coffee`; Marktvergleich → Methodik/`/discover`;
   Design → `/discover` (öffentliche Brandings); Book & Kit → Startseiten-Artefakte.
5. **Preis-Zeile + CTA** — genau EINE Aussage je Produkt (§5), daneben
   Voraussetzung (z. B. „setzt eine abgenommene Brand Foundation voraus").

CTA-Ziele (alle existieren): frei → `/brand-check` bzw. Start-Modal/`/invite`
(wie Startseite: eingeloggt `/dashboard/brands`); Erstgespräch →
`/erstgespraech`.

**Slugs je Sprache** (Davids Entscheidung 2026-09-09, gegen die Empfehlung
„nur englisch"): englisch `/products`, `/products/brand-check`,
`/products/brand-foundation`, `/products/market-comparison`,
`/products/brand-design`, `/products/brand-book-kit`; deutsch
`/de/produkte`, `/de/produkte/brand-check`, `/de/produkte/brand-foundation`,
`/de/produkte/marktvergleich`, `/de/produkte/brand-design`,
`/de/produkte/brand-book-kit`. Die vier englischen Eigennamen bleiben in
beiden Sprachen (Eigennamen-Regel); übersetzt werden nur die deutschen
Wörter „Produkte" und „Marktvergleich". Technik: `defineI18nRoute({ paths })`
in der Seite (`customRoutes: 'page'` ist der i18n-Default), interne Links
weiter über `localePath()` — die Nav-Registry trägt den englischen Pfad,
`localePath` löst je Sprache auf.

## 5. Preis-Zeile je Produkt (Vorschlag)

| Produkt | Zeile | CTA |
|---|---|---|
| Brand-Check | „Kostenlos, ohne Konto." | Brand-Check starten |
| Brand Foundation | „Kostenlos — in der geschlossenen Beta per Einladung oder Warteliste." | Branding starten / Einladungscode |
| Marktvergleich | „149 € netto je Branding, einmalig — zzgl. USt. Beta-Konten nutzen ihn frei; der Kauf folgt, bis dahin per Erstgespräch." | Erstgespräch |
| Brand Design | „Studio-begleitet: Freischaltung je Marke nach dem Erstgespräch." | Erstgespräch |
| Brand Book & Kit | „Folgt — im Einmalpreis der Ableitung (149 € netto je Branding) enthalten." | Erstgespräch |

Davids Entscheidung 2026-09-09 (gegen die Empfehlung „kein Betrag vor Z1"):
der Betrag **erscheint jetzt** auf den Marketing-Seiten. Das hebt den Satz
„vor Z1 erscheint der Betrag nirgends im Produkt" aus BS1 §9.2 für die
MARKETING-Seiten auf; die Schranke in der Werkstatt (`market.paywall.price`
= „Preis im Erstgespräch") bleibt bis Z1 unverändert. EIN Preis, zweimal
genannt, kein zweiter Betrag: Book & Kit ist Teil desselben Einmalpreises.
Der Betrag lebt als EINE Konstante (`app/utils/productPricing.ts` in der App),
die Z1 mit dem Stripe-Katalog verdrahtet.

## 6. Nav-Rückkehr

Heute: `products` als Aufklapper ohne eigene Seite (`to: ''`) mit einem Kind
Brand-Check (Registry `pukalani.chrome.nav` in `packages/brand/app/app.config.ts`).
Vorschlag: der Hauptpunkt bekommt `to: '/products'` (die Übersicht reist per
`navMenuChildren()` als erster Eintrag in den Aufklapper — so entscheidet es
core, s. Kommentar in `BwSiteNav.vue`), darunter die fünf Produktseiten als
Kinder mit Icon + Titel + Beschreibung (Nuxt-UI-Muster; die Beschreibungs-
Schlüssel `brand.nav.product.*` stehen bereits, `experience`/`monitoring`
bleiben ungenutzt stehen). Die Registry (`PukalaniChromeNavEntry`, core)
kennt heute `icon`, aber keine Beschreibung — sie bekommt ein optionales
`descriptionKey` (expliziter Vertrag statt Schlüssel-Konvention im Renderer;
eigener core-Commit; `check:i18n-keys` FIELDS-Tabelle um das Feld ergänzen). Die Seiten liegen in **apps/branding** (wie
`/about`): die App kennt laut `site.manifest.ts` alle ihre Produkte, ein
Layer darf die anderen nicht kennen (A14). Die Kinder-Einträge trägt die App
in ihrer `app.config.ts` nach (tiefer Merge in die Registry).

## 7. Fragen an David (Konzeptrunde, 2026-09-09)

Gestellt per AskUserQuestion in zwei Runden (vier + zwei Fragen), Empfehlung
jeweils zuerst; Antworten in §8.

## 8. Entscheidungen (David, 2026-09-09)

| # | Frage | Entscheidung | Empfehlung war | Folge |
|---|---|---|---|---|
| a | Produkte + Reihenfolge | **Fünf + zwei „kommt"-Karten** (Brand-Check → Foundation → Marktvergleich → Brand Design → Book & Kit; Experience + Monitoring abgeblendet, ohne Link) | Fünf ohne „kommt" | §3 |
| b | Routen | **Deutsche Slugs je Sprache** (`/de/produkte/marktvergleich`) | `/products/<englischer-slug>` | §4, `defineI18nRoute` |
| c | Preis vor Z1 | **149 € netto jetzt zeigen** | Kein Betrag vor Z1 | §5; BS1 §9.2 Nachtrag |
| c2 | Book & Kit-Zeile | **„Im Einmalpreis enthalten"** (149 € einmal, zweimal genannt) | = Empfehlung | §5 |
| d | Länge/Beleg | **Ein Screen + echter Beleg-Link** | = Empfehlung | §4 |
| e | Nav | **Aufklapper mit Kindern** (Icon + Titel + Beschreibung), Übersicht als erster Eintrag | = Empfehlung | §6; Registry braucht `descriptionKey` |

## 9. Pakete (nach Freigabe)

- **PS1-P0 Prototyp** — Übersicht + eine Produktseite (Marktvergleich, weil
  sie Preis-Zeile UND Voraussetzung zeigt) im Worktree auf freiem Dev-Port;
  Davids Klick.
- **PS1-P1 Bau** — fünf Seiten + Übersicht (de/en), Nav-Kinder, SEO
  (`useLocaleSeoHead`), Wächter (`check:i18n-keys`, `check:doc-links`,
  `check:manifests`), Beweis per Klick, Deploy, `.build`-Beweis.
- **Nachzieher** — OPEN-ITEMS PS1 → COMPLETE mit „Gelernt"; DECISION-LOG.
