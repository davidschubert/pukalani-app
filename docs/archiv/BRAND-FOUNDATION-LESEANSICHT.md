# Brand Foundation als Guidelines — die Leseansicht des Ergebnis-Dokuments

Konzept (Workflow-Phase 2), Stand 2026-09-05. Noch kein Code. Beantwortet den
Rest von P5–P7 aus dem Phase-1-Plan (Export, Teilen, `result.direction`), der
nach BW2 als „neues Vorhaben" offen blieb.

---

## 0. Was das hier ist

**Anlass.** David hat am 2026-09-05 eine allgemeine Definition von Brand
Guidelines eingebracht (sechs Kern-Elemente: Brand Story, Logo-Regeln,
Farbpalette, Typografie, Tone of Voice, Bildsprache; Nutzen: Vertrauen,
Zeit, Fehlervermeidung) und entschieden: das Ergebnis-Dokument des Wizards
wird an diesem klassischen Aufbau ausgerichtet — als KONZEPT, nicht als Kopie
(Leitplanke, nicht Vorlage).

**Was heute steht (nichts davon wird neu gebaut).**

- `/brand/:id/document` „Euer Branding" (BW2 Paket 7, von David abgenommen
  2026-09-05): alle bestätigten Werte in Registry-Reihenfolge, je Kapitel ein
  Abschnitt, Zähler „x von y abgenommen", Notizen des Schliess-Aufrufs,
  offene Befunde als Chips, „Dokument prüfen" (Prüfblick auf Klick). Es ist
  die **Finale Abnahme der Ebene 1** — eine ARBEITS-Ansicht.
- **Teilen existiert als Backend, ohne Seite:** `brand_shares` (brand-004),
  `POST /api/brand/profiles/:id/share` friert einen Snapshot ein (Story +
  bestätigte Kapitel-Werte + `presetId/presetVersion`, 30 Tage, Token nur als
  Hash, Rotation widerruft die Vorgänger), `GET /api/brand/share/:token`
  liefert ihn mit `no-store`, `noindex`, `frame-ancestors 'none'`;
  `revoke.post.ts`. Es gibt KEINE Seite `/brand/share/:token`, keinen
  Share-Dialog und keine i18n-Schlüssel `brand.share.*`.
- **Brand Story** hat ihre Spalten (`storyBody`/`storyMeta`, `toStoryView`).
- `result.direction` (Richtung) und `result.rating` sind in der Registry,
  das Kapitel `result` ist im Fortschritts-Rail eine gesperrte Kachel; Optionen
  für die Richtung gibt es nicht (`brandChoiceOptions.ts` kennt nur
  Architektur-Modelle und Archetypen).
- Die Startseite verspricht unter „Was am Ende auf dem Tisch liegt" ein
  **Brand Book mit 24 Kapiteln, Do & Don't, AI-Guidelines**, dazu brand.json,
  Design-Tokens, Pressekit, Content-Kompass, 90-Tage-Plan — das ist
  Produkt 03 „Brand Book & Kit" der Suite (Phase-1-Plan §5b), BEZAHLT.

**Der Abgleich** der sechs klassischen Elemente mit der Registry (68
Sessions, 9 Kapitel):

| Klassisches Element | Im Wizard | Kapitel |
| --- | --- | --- |
| Brand Story (Purpose, Vision, Mission, Werte) | vollständig | pvm, values, manifesto + Georges Story |
| Tone of Voice | vollständig | archetype (Archetyp, Ton-Wörter, Stimmproben, Tabu-Wörter), verbal (Tagline, Boilerplates, Kernbotschaften, Wort-Leitfaden) |
| Logo-Regeln | fehlt | — (Produkt 02 Brand Design) |
| Farbpalette | fehlt für den Kunden (`brandPalette.ts` sind nur die 12 Kachel-Dreiklänge der Übersicht) | — (Produkt 02) |
| Typografie | fehlt | — (Produkt 02) |
| Bildsprache | fehlt | — (Produkt 02) |

Dazu hat der Wizard drei Dinge, die die klassische Liste nicht kennt und die
eine Agentur zuerst klärt: **Positionierung und Markenarchitektur**, **Name**
und das **Manifest**. Der Wizard deckt also die verbale Hälfte der Guidelines
vollständig und tiefer ab, die visuelle Hälfte gar nicht — genau die
Produktentscheidung vom 2026-08-27 (Fundament frei, Ableitung bezahlt).

---

## 1. Strategie (kurz — die lange Fassung ist der Phase-1-Plan §5b)

### 1.1 Wo stehen wir

Am Ende des Gesprächs liegt ein Dokument, das für den BESITZER gebaut ist:
es zeigt Zähler, Notizen, Befunde und Knöpfe. Für den zweiten Leser — den
Mitgründer, die Designerin, den Texter, den man beauftragt — ist es das
falsche Dokument: er will wissen, WAS gilt, nicht wie weit die Abnahme ist.
Das Share-Backend friert genau diese Sicht schon ein, aber niemand kann sie
sehen.

### 1.2 Zielbild in einem Satz

**Ein Dokument, zwei Ansichten:** „Euer Branding" bleibt die Arbeitsansicht
(abnehmen, prüfen, korrigieren); die **Brand Foundation** ist dieselben
bestätigten Werte als GUIDELINES gelesen — Kapitel wie ein Markenhandbuch,
Do & Don't aus den vorhandenen Feldern, die visuellen Kapitel als sichtbare,
begründete Schranke zu Produkt 02/03 — teilbar per Link, druckbar, ohne einen
einzigen neuen KI-Aufruf.

### 1.3 Warum der Name „Brand Foundation" und nicht „Brand Guidelines"

Die Startseite hat „Brand Book" (24 Kapitel) bereits als BEZAHLTES Produkt 03
vergeben, und die Suite-Leiter heißt Foundation → Design → Book & Kit →
Experience. Ein freies Artefakt namens „Guidelines" stünde zwischen Foundation
und Book und würde beim Kunden die Frage auslösen, was er dann noch kauft.
„Brand Foundation" ist der Begriff des Phase-1-Plans, der Startseite
(„Brand Foundation steht — in etwa 45 Minuten") und der Suite. Der
GUIDELINES-AUFBAU ist die Form des Dokuments, nicht sein Name. (Entscheidung
§6 a.)

### 1.4 Wer liest sie

- **Der Besitzer** — als Beweis, dass etwas Fertiges entstanden ist (füllt
  den Befund „am Ende steht kein Ergebnis"), und als Referenz für alles, was
  danach kommt.
- **Der zweite Leser per Link** (Team, Dienstleister): nur Festlegungen,
  keine Rohantworten, keine Chats, keine Zähler.
- **Der Kunde von Produkt 02/03**: die Foundation ist der Input jeder
  Ableitung; die Schranken-Kapitel sagen ihm, was dort entsteht.

### 1.5 Konkurrenz und Referenzen (Recherche 2026-09-05, Davids Linkliste — Quellen in Anhang A)

Drei Sorten von Anbietern, und keiner baut, was der Wizard baut:

1. **Container für fertige Guidelines** — Frontify, Corebook°, standards.site,
   Brandkit. Sie nehmen an, dass eine Agentur den INHALT geliefert hat, und
   verkaufen dessen Verteilung: digitale statt PDF-Richtlinien, Live-Updates,
   Tieflinks auf Abschnitte, öffentlich/intern getrennter Zugang, Custom
   Domain, DAM daneben. Zielkunden sind Marken-Teams (Uber, Crocs, Cash App);
   Preise sind Abos je Sitz (Corebook° und standards.site mit Gratis-Test,
   Frontify und Brandkit nur per Demo/Editionen).
2. **Generatoren fürs Visuelle** — Looka, Adobe Express (Logo, Palette,
   Vorlagen), das Lovable-Template „Brand Kit Extractor" (URL rein → Farben,
   Schriften, Voice & Tone, Tokens, PDF/Tailwind/`design.md` raus). Sie
   beginnen dort, wo unser Fundament aufhört, oder EXTRAHIEREN aus einer
   bestehenden Website — das ist die Achse unserer URL-Analyse und des
   Brand-Checks, nicht die der Foundation.
3. **Galerien und Ratgeber** — brandingstyleguides.com (≈ 3.600 PDF-Manuals,
   filterbar nach Sprache/Jahr/Region/Umfang), Behance (> 10.000 Projekte),
   Frontify/Wix/HubSpot/Vistaprint/Adobe-Ratgeber mit „Beispielen, die
   inspirieren". Sie zeigen, was Leser ERWARTEN.

**Was der Markt einhellig sagt — und was wir daraus machen:**

| Marktbefund (Quelle) | Folge für die Foundation |
| --- | --- |
| Digital schlägt PDF: „leichter zu navigieren, zu aktualisieren, zu teilen" (Frontify-Guide, Bynder, Brandkit-Regel 9, HubSpot am Dropbox-Beispiel, Corebook°, standards.site) | Bestätigt Entscheidung e: die Leseansicht IST das Produkt, Druck ist Beigabe. Kein Server-PDF. |
| Ein lebendes Dokument: Live-Updates, Versionen, „mindestens jährlich prüfen" (Bynder, Corebook°, Brandkit-Regel 8) | Die private Ansicht liest LIVE-Werte; der Share-Snapshot ist der bewusst eingefrorene Stand mit Datum — beides ausweisen (§2.1). Korrektur-Regel §9 ist unser Versions-Mechanismus. |
| Kapitel-Reihenfolge fast überall: Story/Vision → Logo → Farbe → Typografie → Bildsprache → Stimme → Anwendungen/Downloads (Frontify-Guide, HubSpot, Wix, Adobe, Vistaprint, Boston.gov) | Leser ERWARTEN das Visuelle an zweiter Stelle. Wir haben es nicht — deshalb Entscheidung d: Kapitel 10 sichtbar gesperrt, mit Begründung. Ein Leser, der „wo ist das Logo?" fragt, bekommt eine Antwort statt einer Lücke. |
| Do & Don't sind Standard, oft das, was gelobt wird (Frontify-Guide, Wix an TripAdvisor/NASA, Boston.gov Fotografie, Brandkit-Regel 2 „explizit, was man NICHT tun sollte") | §2.4: Do/Don't aus vorhandenen Feldern — Stimmproben, Wort-Leitfaden, gelebte Beispiele vs. Tabu-Wörter. Kein Kapitel ohne mindestens ein Don't, wo die Registry eins hergibt. |
| AI-Guidelines sind inzwischen Kernbestandteil (Bynder nennt sie neben Logo und Farbe; Frontify „lesbar für KI", Corebook° MCP, Brandkit „Brand Bot", Lovable `design.md` für KI-Agenten) | Kapitel 11 „Regeln für KI-Texte" bleibt im FREIEN Fundament (aus vorhandenen Werten, §2.4). Das maschinenlesbare Modul (brand.json/MCP) bleibt Produkt 03 — der Markt bestätigt, dass es ein eigenes Verkaufsargument ist. |
| Tieflinks je Abschnitt und getrennter Zugang öffentlich/intern (Corebook°, HubSpot, Brandkit-Portal) | Jedes Kapitel bekommt einen stabilen Anker (`#stimme`), der auch im Share-Link trägt; die Trennung öffentlich/intern ist bei uns `audience`/`sensitivity` (§2.3) — dieselbe Idee, auf Feld-Ebene statt auf Seiten-Ebene. |
| Quick-Access-One-Pager neben dem vollen Dokument (HubSpot) | Empfehlung für den Prototyp: über Kapitel 0 ein Block **„Auf einer Seite"** — Purpose, drei Werte, Archetyp, Tagline, Zeile für die Wand — gebaut aus vorhandenen Feldern, kein neues Kapitel. |
| Ansprechperson für Ausnahmen (Brandkit-Regel 5) | In Phase 1 NICHT: keine öffentlichen Profile (AH-7), und der Share-Link ist anonym lesbar. Vermerk für Produkt 03 (Pressekit trägt ohnehin einen Kontakt). |
| Umfang: das Archiv brandingstyleguides.com zählt am häufigsten 20–39 Seiten (1.140 Manuals), dann 3–19 (721) und 40–59 (705) | Die Foundation mit 10–12 Kapiteln in Lesebreite liegt im Erwartungsrahmen; der Druck darf 15–25 Seiten haben, nicht 60. |
| Stimme als wenige Prinzipien mit je einem Satz (Boston.gov: Confident/Helpful/Optimistic/Humble/Personal) | Ton-Wörter (d.toneWords) je mit EINER Stimmprobe darunter, statt einer nackten Chip-Reihe (§2.2 Kapitel 6). |

**Unsere Lücke gegenüber den Containern, ehrlich:** kein DAM, keine
Downloads (es gibt nichts Visuelles zum Herunterladen), keine Custom Domain,
kein Kommentieren. Nichts davon fehlt einem Fundament — es fehlt einem
Brand Book, und das ist Produkt 03. **Unser Vorsprung:** der Inhalt entsteht
bei uns im Gespräch und liegt STRUKTURIERT vor (68 Felder mit Herkunft) — jeder
Container der Liste bekommt ihn als Prosa. Die Galerien (Behance,
brandingstyleguides.com) und die Designer-Marktplätze (Squarespace) sind kein
Wettbewerb, sondern die Discover-/„Creator beauftragen"-Ideen aus Phase-1-Plan
§5b, nicht Teil dieses Vorhabens.

---

## 2. Konzept

### 2.1 Produktform: eine Quelle, ein Renderer, zwei Ansichten

- **Quelle** bleibt die Registry-Wahrheit: bestätigte Slot-Werte je Kapitel
  (privat: live aus `brand_steps`; öffentlich: der eingefrorene
  `BrandShareSnapshot`). Kein zweites Datenmodell, keine neue Tabelle für den
  Inhalt.
- **Renderer** = EINE pure Regel in `packages/brand/shared/
  brandFoundation.ts`: `buildBrandFoundation(input) → BrandFoundationView`
  (Abschnitte, Blöcke, Do/Don't-Paare, Schranken-Kapitel). Sie liest die
  Registry (Kapitel-Reihenfolge, das neue Feld `audience`, §2.3) und den
  Wertevorrat; sie kennt weder Appwrite noch H3 noch i18n — wie
  `brandDocument.ts` und `brandWorkspaceNav.ts`. Beide Ansichten rufen
  dieselbe Funktion; ein Unterschied zwischen privat und geteilt wäre damit ein
  Testfall, kein Zufall.
- **Zwei Ansichten:** `/brand/:id/foundation` (privat, `requireBrandAccess`,
  fremdes Branding ⇒ 404 wie Werkstatt und Dokument) und `/brand/share/:token`
  (öffentlich, Snapshot, die AUSDRÜCKLICHE Ausnahme von `requireBrandAccess`
  — Phase-1-Plan Audit 5/6). Die private Ansicht rendert LIVE-Werte (mit dem
  Hinweis, welche Kapitel noch nicht abgenommen sind), die geteilte den
  Snapshot mit Stand-Datum.

### 2.2 Die Kapitelstruktur (klassischer Aufbau, gefüllt aus der Registry)

Reihenfolge und Inhalt sind eine Zuordnung Registry → Guidelines, keine neue
Inhaltsquelle. Kapitel, deren Weg nicht gelaufen ist (B2 ohne Untermarken,
F mit vorhandenem Namen), entfallen ohne Lücke — wie im Snapshot heute.

| # | Guidelines-Kapitel | Gefüllt aus (Slot-Ids) | Form |
| --- | --- | --- | --- |
| 0 | **Brand Story** | `storyBody` (Georges Synthese, editierbar, als Synthese gekennzeichnet) | Fließtext, Einstieg — fehlt sie, entfällt das Kapitel (kein Erzeugen beim Lesen) |
| 1 | **Kontext & Zielgruppe** | a.pitch, a.category, a.audienceSketch — NICHT a.competitors/a.facts (`sensitivity: internal`, §2.3) | Pitch als Leitsatz, Kategorie, Segmente als Karten |
| 2 | **Purpose, Vision, Mission** | b.purpose, b.vision, b.mission | drei Leitsätze, je ein Block |
| 3 | **Positionierung** | b.positioningCategory, b.positioningFirstChoice | Kategorie + „Erste Wahl für" |
| 4 | **Markenarchitektur** (nur wenn gelaufen) | b2.model, b2.rule | Modell-Karte (§12.3-Karten-UI) + Regel |
| 5 | **Werte** | c.final, c.definitions, c.livedExamples, c.conflictRule, c.teamFilter (nur Team) | je Wert: Definition + gelebtes Beispiel (= Do); Konfliktregel als Kasten |
| 6 | **Persönlichkeit & Stimme** | d.primary, d.secondary, d.emotion, d.toneWords, d.voiceSamples, d.vocabulary, ep.vocabulary | Archetyp-Karte, Ton-Wörter als Chips, **Do & Don't**: Stimmproben + Wort-Leitfaden = Do, Tabu-Wörter = Don't |
| 7 | **Manifest** | e.manifesto, e.anchorLine, e.composition | Manifest als Fließtext (richtext), Zeile für die Wand hervorgehoben |
| 8 | **Tagline & Messaging** | ep.taglines, ep.boilerplates (drei Längen), ep.keyMessages, ep.distinctiveAsset | Tagline groß, Boilerplates kopierbar, Kernbotschaften je Zielgruppe |
| 9 | **Name** (nur wenn gelaufen) | f.decision, f.checks, f.criteria | Top drei + Prüf-Tabelle |
| 10 | **Visuelle Identität** — Logo, Farbwelt, Typografie, Bildsprache, Motion | `result.direction` (sobald gewählt) + die Schranke | §2.5 |
| 11 | **Regeln für KI-Texte** | d.toneWords, d.vocabulary, ep.vocabulary, c.final | ein fester Absatz-Rahmen, gefüllt aus vorhandenen Werten (§2.4) |

Die Kapitel 0–9 sind das Fundament (frei), 10 ist die Schranke, 11 ist der
Teaser auf das maschinenlesbare Modul aus Produkt 03.

### 2.3 Was NICHT in die Leseansicht gehört — zwei Fragen, zwei Felder

Das Arbeits-Dokument zeigt alle 68 Sessions, denn dort wird abgenommen. Die
Guidelines zeigen FESTLEGUNGEN, keine Rohantworten: „Gründungsimpuls",
„Party-Persona", „Branchen-Ärgernis" sind Material für George, kein Inhalt
fürs Handbuch. Zwei verschiedene Fragen entscheiden darüber, und sie haben
zwei Felder — nach dem Muster `as`/`actor` der Datentür:

1. **Darf es reisen?** — das EXISTIERENDE Registry-Feld `sensitivity:
   'public' | 'internal' | 'private'` (BW2 §3a „Vertraulichkeit"; Kopf-
   Kommentar: „Was per Share-Link und Export standardmässig NICHT reist").
   Heute `internal`: a.competitors, a.complaints, a.challenge, a.facts
   (per Test genagelt). **BEFUND 2026-09-05:** dieses Feld hat KEINEN Leser
   ausser der Werkstatt-Antwort — `share.post.ts` friert über
   `confirmedSlotValues` ALLE bestätigten Werte ein, Wettbewerber-Schwächen
   und Beschwerden eingeschlossen. Der Vertrag steht, der Code hält ihn nicht;
   sichtbar ist es nur deshalb nicht, weil es die Share-Seite noch nicht gibt.
   **GESCHLOSSEN 2026-09-06 durch die Nachbar-Sitzung (MV1 M5, Commit
   ae3b70d7):** `brandShareableSlotValues` in `shared/brandSharing.ts` wirft
   beim Veröffentlichen alles heraus, was nicht `public` ist — aufgefallen am
   Massstab des Marktvergleichs („vertraulich wie a.competitors"). G1 baut
   darauf auf: die `audience`-Bedingung wird in DIESE Regel integriert (eine
   Wahrheit, kein zweiter Filter), der Renderer filtert zusätzlich nach
   Registry (Doppelnetz §2.8).
2. **Ist es eine Festlegung?** — ein NEUES, additives Feld `audience:
   'foundation' | 'internal'` je Session (Muster `defineSession`). Eine
   Rohantwort wie a.origin ist nicht vertraulich und trotzdem kein
   Handbuch-Inhalt; eine `sensitivity`-Verschärfung wäre dafür das falsche
   Werkzeug, weil sie auch den Export und die Werkstatt-Anzeige meint.
   - Default nach Typ: `derivation`/`stage-edit`/`choice` ⇒ `foundation`,
     `question` ⇒ `internal`.
   - Ausnahmen, in denen eine Menschenfrage eine Festlegung IST:
     c.livedExamples, c.conflictRule, c.teamFilter, b.positioningFirstChoice,
     d.vocabulary ⇒ `foundation`. b2.visibility/roleOfMaster/namingPattern
     bleiben `internal` (die Festlegung ist `b2.rule`, das Modell `b2.model`).
   - `result.rating` ist immer `internal`.
   - **Regel, per Test genagelt:** `sensitivity !== 'public'` ⇒ `audience:
     'internal'` — ein Feld darf nie „Festlegung" heissen und zugleich
     „reist nicht".
   - Gegenprobe im Test: ein Slot auf `internal` gesetzt ⇒ verschwindet aus
     `buildBrandFoundation`; jede Guidelines-Zelle aus §2.2 zeigt auf
     mindestens eine `foundation`-Session.

Notizen, Befunde, Konfidenz, Zähler, Chats: nie in der Leseansicht
(Phase-1-Plan §3d Nr. 6: „NIE interne Chats, KI-Metadaten oder technische
Statuswerte").

### 2.4 Do & Don't und die KI-Regeln — ohne neue Generierung

Die Startseite zeigt als Beweis „Kapitel 07 · Stimme — Do: ‚unsere Bohnen' /
Don't: ‚Premium-Selektion'". Genau das liefern die vorhandenen Felder:

- **Do** = Wort-Leitfaden (ep.vocabulary), Stimmproben (d.voiceSamples),
  gelebte Beispiele je Wert (c.livedExamples).
- **Don't** = Tabu-Wörter (d.vocabulary), Anti-Wörter des Leitfadens, wo er
  Paare enthält.
- **Regeln für KI-Texte** (Kapitel 11) sind ein FESTER Rahmen in i18n
  („Schreibt in diesem Ton: … · Vermeidet: … · Steht für: …"), in den die
  Werte eingesetzt werden. Keine Generierung, kein Eimer, kein Cache — das
  Kapitel ist so aktuell wie die Werte. Das maschinenlesbare `brand.json`
  bleibt Produkt 03.

### 2.5 Die visuelle Schranke und `result.direction`

Die klassischen Elemente Logo, Farbe, Typografie, Bildsprache (plus Motion)
FEHLEN im Fundament — bewusst. Das Kapitel zeigt sie als **gesperrte, aber
sichtbare Abschnitte** (wie die Info-Layer der gesperrten Gruppen im Dummy):
je ein Satz, was dort entsteht und woraus (Archetyp → Farbwelt, Ton-Wörter →
Typografie-Charakter), und ein CTA. Das ist die „sichtbare Bezahlschranke"
aus Phase-1-Plan §5 Nr. 2, ehrlich beschriftet.

`result.direction` (Richtung) bleibt das Scharnier: Phase-1-Plan §5 sieht
2–3 Farb-/Typo-Richtungen aus der Themes-Engine in Preview-iframes vor
(Technik-Vertrag Audit 3: globales `:root` ⇒ je Richtung ein iframe). Das
ist ein EIGENES Paket mit Davids Gate (Schranken-Text + Preisanker, P7 im
Phase-1-Plan) und steht hier nur mit seinem Platz: Kapitel 10 rendert die
gewählte Richtung (Name, Begründung, Farbrampe, Schriftpaar aus dem
validierten Preset) — bis dahin nur die Schranke. Der Snapshot trägt
`presetId/presetVersion` bereits, damit eine spätere Theme-Änderung ein
geteiltes Dokument nicht rückwirkend umfärbt.

### 2.6 Oberfläche

**Private Ansicht `/brand/:id/foundation`** (Layout `brand-workspace`, wie
`document.vue`):

- Kopf: Titel der Marke, „Brand Foundation", Stand (letzte Abnahme), Stand-
  Zeile „x von y Kapiteln abgenommen" — der EINZIGE Zähler auf dieser Seite,
  und nur privat.
- Inhaltsverzeichnis links (Kapitel 0–11, Sprungmarken; gesperrte Kapitel
  mit Schloss-Glyphe), Lesefläche in Lesebreite (2xl/3xl, wie überall).
- Nicht abgenommene Kapitel erscheinen mit dem Vermerk „noch nicht
  abgenommen" und einem Link zur Abnahme; leere Kapitel als eine Zeile
  („Noch nichts festgelegt"). Sonst KEINE Knöpfe im Text — korrigiert wird im
  Dokument/der Session (§9-Regel), nie hier.
- Kopfzeile rechts: **Teilen**, **Exportieren**. Kein Bearbeiten. Das
  Export-Menü zeigt ALLE Ausgabeformen der Suite, frei und gesperrt
  nebeneinander (dieselbe Ehrlichkeit wie Kapitel 10): **Drucken/PDF**
  (frei, Browser-Druck) · **brand.md / brand.json** („Brand Context" für
  KI-Agenten) · **Design-Tokens** (CSS/Tailwind/JSON) · **Assets.zip** —
  die drei letzten gesperrt mit einem Satz, was sie enthalten, und dem
  Produkt, das sie liefert (03 Brand Book & Kit). Beim Fremdleser nur Drucken.
- Einstieg: neuer Eintrag in der Seitenleiste unter „Euer Branding" (Rail:
  Dokument → Foundation), plus ein Knopf „Als Foundation lesen" oben im
  Dokument. Die gesperrte `result`-Kachel des Rails wird zu diesem Eintrag
  (Entscheidung §6 d).

**Share-Dialog** (Phase-1-Plan §3d Nr. 8, wörtlich): Vorschau „So sehen
Empfänger das Dokument", Ablaufdatum (30 Tage), Link kopieren, Widerrufen,
Liste dessen, was sichtbar wird, und die Bestätigung, dass Chats, Entwürfe und
Rohantworten NICHT enthalten sind. Erneutes Veröffentlichen = neuer Link,
alte widerrufen (Backend macht das schon).

**Öffentliche Ansicht `/brand/share/:token`** (Layout `default` der App,
kein Workspace): derselbe Renderer auf dem Snapshot; Kopf „Brand Foundation ·
<Marke> · Stand <publishedAt>"; Fuß „Erstellt mit Branding Supply" +
Link auf die Startseite (der einzige Marketing-Zug, dezent); kein
Inhaltsverzeichnis mit Schloss — die visuellen Kapitel erscheinen dort als
EIN Satz („Visuelle Identität: folgt in Brand Design"), keine Preisanker
beim Fremdleser. `og:title`/`og:description` aus Titel + erstem Satz der
Story (Messenger-Vorschau, Phase-1-Plan Ergänzung 2026-08-28) trotz
`noindex`.

**Print** = `@media print` der Leseansicht (Phase-1-Plan Ergänzung
„Print-CSS der Leseansicht"): Seitenumbruch je Kapitel, Kopfzeile mit Marke
und Stand, Fußzeile mit Seitenzahl, keine Navigation, keine Schranken-CTAs.
PDF ist in Phase 1 der Browser-Druck (Phase-1-Plan §2: „PDF-Export später").

**Mobil:** Leseansicht ist reines Lesen und trägt sich mit Lesebreite
selbst; Davids „reicht für jetzt" (2026-09-03) gilt.

### 2.7 Datenmodell — alles additiv, keine Migration für den Inhalt

- Registry: `audience` je Session (§2.3), neben dem bestehenden
  `sensitivity`. Registry-Fassung bleibt 1, weil das Feld weder den Prompt
  noch den Hash-Input berührt (`sourcesHash` und `inputHash` lesen Werte,
  keine Anzeige-Metadaten — Test).
- `BrandShareSnapshot` bleibt `schemaVersion: 1`; der Renderer verkraftet
  Kapitel ohne Story und fehlende Slots (Snapshots von heute bleiben lesbar).
  Ein `schemaVersion: 2` kommt erst, wenn der Snapshot mehr trägt als heute
  (z. B. die gewählte Richtung mit Preset-Tokens) — dann liest der Renderer
  beide.
- Kein neues Profil-Feld „geteilt": `hasActiveShare` bleibt abgeleitet
  (Audit 5).
- `brand_events` (`BrandEventType`, Punkt-Schreibweise wie `share.published`,
  das es schon gibt): neu `foundation.viewed`, `share.revoked`, `share.viewed`
  (ohne Token, ohne IP-Klartext), `print.started`. Regel 1 des Ereignis-Kopfs
  gilt: nie Inhalt im `payload`.

### 2.8 Sicherheits-Verträge (prüfbar)

- Werte sind Nutzertext und teils Markdown (`e.manifesto` ist richtext):
  Rendern NUR über den Parser aus `core/shared/markdown.ts` (gfm aus, die
  bekannte Werkzeug-Kopplung), keine rohe HTML-Ausgabe; Links nur mit
  sicheren Protokollen (Phase-1-Plan Audit 5).
- Share-Seite: `noindex` als Meta UND `X-Robots-Tag` (API setzt es schon),
  `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` auch für die
  SEITE (heute nur die API-Antwort) — über `registerEmbeddableRoute` bleibt
  der Default `'self'`, die Share-Seite setzt bewusst enger. Nicht in
  Sitemap, nicht in Analytics-Goals mit Token.
- Der Token reist nur im Pfad, wird nie geloggt (`share_viewed` ohne Token)
  und nie in einen Link mit Query gelegt.
- Private Ansicht: fremdes/unbekanntes Branding ⇒ 404 (DECISION-LOG
  2026-09-05), `blocked` ⇒ die ruhige Fläche wie überall.
- Der Renderer zeigt NIE Sessions mit `audience: 'internal'` oder
  `sensitivity !== 'public'` — auch nicht, wenn sie im Snapshot stehen
  (Snapshots von heute enthalten ALLE bestätigten Werte, s. Befund §2.3; der
  Renderer filtert nach Registry, nicht nach Snapshot-Inhalt). Beim nächsten
  Veröffentlichen schreibt `share.post.ts` nur noch reisefähige
  `foundation`-Werte (Doppelnetz: Schreiben UND Lesen filtern).

### 2.9 KI, Kosten

Null neue KI-Aufrufe. Die Brand Story bleibt, wie sie ist (am Profil, nur
bei echter Slot-Änderung invalidiert). Der Prüfblick bleibt im Dokument.

### 2.10 Messung

- Anteil der abgeschlossenen Brandings, die die Foundation öffnen
  (`foundation_viewed`), teilen (`share_published`) und drucken — das ist
  die Antwort auf die Startseiten-Behauptung „Werkzeuge, mit denen ihr am
  nächsten Tag arbeitet".
- Share-Aufrufe je Link (`share_viewed`, ohne Token): sagt, ob der zweite
  Leser existiert.
- Klicks auf die Schranke (Kapitel 10 CTA) = das Signal für Produkt 02.

### 2.11 Prototyp (Phase 3, nach Freigabe) — ein Screen je Interaktionstyp

Im bestehenden Playground (`packages/brand/.playground`, Port 3009), echte
Nuxt-UI-Komponenten, echter Inhalt (Kailua Coffee Co.):

1. Private Leseansicht Desktop (Inhaltsverzeichnis + drei gefüllte Kapitel +
   ein „noch nicht abgenommen"-Kapitel).
2. Kapitel 6 mit Do & Don't-Paaren und Kapitel 11 mit dem KI-Rahmen.
3. Kapitel 10 als Schranke (gesperrt) und einmal MIT gewählter Richtung.
4. Share-Dialog.
5. Öffentliche Share-Ansicht (Layout `default`, Fuß, og-Vorschau als Text).
6. Druck-Vorschau (Browser-Druck einer Seite).

---

## 3. Nicht-Ziele (dieses Vorhaben)

- Kein Server-PDF, kein DOCX. Browser-Druck reicht (Phase-1-Plan §2).
- Kein Logo-, Farb-, Typo- oder Bild-Generator; die Themes-Vorschau
  (`result.direction`, 2–3 Richtungen, Preview-iframes) bleibt ein eigenes
  Paket mit Davids Gate.
- Kein `brand.json`, keine Design-Tokens, kein Pressekit — Produkt 03.
- Kein Kommentieren, kein zweiter Bearbeiter, kein Passwort am Link
  (Kollaborations-Grenze Phase 1).
- Kein Discover, keine öffentliche Galerie — Snapshot-Share bleibt privat
  per Link.
- Keine neue Inhaltsquelle: kein Kapitel wird generiert, das nicht aus
  bestätigten Feldern folgt.

---

## 4. Abhängigkeiten und Fallen

- **Namen-Kollision:** „Brand Book" ist auf der Startseite Produkt 03; die
  Foundation darf sich nirgends so nennen (i18n gegenlesen).
- **Snapshots von heute** enthalten alle bestätigten Werte inklusive
  Rohantworten und der vier `internal`-Sessions — der Renderer MUSS
  registry-seitig filtern (§2.8), sonst zeigt ein alter Link Wettbewerber-
  Schwächen und Beschwerden. Zusätzlich: bestehende `brand_shares`-Zeilen
  in Prod prüfen (Zähler); sind es welche, beim G3-Deploy widerrufen —
  ein neuer Link ist ein Klick, ein geleakter Wettbewerber-Satz nicht.
- **Markdown:** `gfm: false` beim Lesen, sonst frisst `~~` Zeichen aus
  Bestands-Texten (CLAUDE.md-Regel).
- **i18n:** neue Schlüssel `brand.foundation.*`, `brand.share.*` in de UND
  en; keine spitzen Klammern in Platzhaltern; Kapitel-Namen der Foundation
  sind ÜBERSETZT (anders als Theme-Namen), Marken-Werte natürlich nicht.
- **Kailua Coffee Co.** als öffentliche Beispiel-Seite (OPEN-ITEMS, BW1
  „Beispiel-Branding als echte Seite") kann denselben Renderer auf einem
  festen Snapshot fahren — Synergie, kein Muss (§5 G5).
- **Worktree-Beweise:** branding-App lokal nur mit der portfolio-Dev-Instanz
  und dem Shiki-Symlink (Memory `brand-wizard-bw2-stand`).

---

## 5. Pakete (Skizze — verbindlich erst nach Prototyp-Freigabe)

| # | Paket | Inhalt | Gate | Beweis |
| --- | --- | --- | --- | --- |
| G1 ✅ 2026-09-06 | **Regel + Renderer** | `audience` in der Registry, Regel `sensitivity ≠ public ⇒ internal`, `brandShareableSlotValues` (MV1 M5) um `audience` erweitert — reist = public UND foundation, `buildBrandFoundation` (pur), Do/Don't-Paarung, KI-Rahmen-Slots | — | Unit: jede Session hat `audience`; Gegenprobe `internal` verschwindet; Snapshot v1 von heute rendert ohne Rohantworten und ohne die vier `internal`-Sessions; Route-Test: neuer Snapshot enthält a.complaints nicht; Hash-Inputs unverändert |
| G2 ✅ 2026-09-06 (Davids Blick offen) | **Private Leseansicht + Print** | `/brand/:id/foundation`, Rail-Eintrag, Knopf im Dokument, `@media print` | Davids Blick auf die Seite | Playwright: 404 bei fremdem Branding; Kapitel-Reihenfolge = Registry; Druck-Snapshot |
| G3 ✅ 2026-09-07 (Davids Blick offen) | **Teilen sichtbar** | Share-Dialog, `/brand/share/:token`, og-Meta, Fuß, Ereignisse | Davids Blick auf die Empfänger-Ansicht | verify-Skript: veröffentlichen → Seite 200 → widerrufen → 404; abgelaufen → 404; kein Token im Log; `internal`-Werte nie im HTML (Gegenprobe) |
| G4 ✅ 2026-09-07 (Davids Blick offen) | **Schranke + Richtung** (= P7-Rest) | Kapitel 10 gesperrt mit CTA; danach `result.direction` mit 2–3 Richtungen in Preview-iframes | **David:** Schranken-Text + Preisanker; Richtungen-Katalog | Playwright: Richtung wählen ⇒ Kapitel 10 zeigt Preset; Share-Snapshot trägt Preset |
| G5 ✅ 2026-09-07 (Davids Inhalts-Gate offen) | **Beispiel Kailua** (optional) | öffentliche Beispiel-Foundation über denselben Renderer, `index` erlaubt | David: Inhalt der Beispiel-Marke | Seite rendert aus festem Snapshot |

Reihenfolge: G1 vor allem; G2 und G3 parallel; G4 zuletzt (hängt am
Richtungen-Katalog, der ein eigenes Gate ist); G5 jederzeit nach G1.

---

## 6. Entscheidungen (David, 2026-09-05, Fragenrunde — alle nach Empfehlung)

| # | Frage | Entscheidung | Verworfen |
| --- | --- | --- | --- |
| a | Kundenname des Artefakts | **„Brand Foundation"** (Suite-Leiter, Startseite, kein Konflikt mit „Brand Book") | „Brand Guidelines" — hätte die Startseite zur Umbenennung von Produkt 03 gezwungen |
| b | Rohantworten in der Leseansicht | **nur Festlegungen** — neues Feld `audience` neben `sensitivity` (§2.3) | alles zeigen wie das Arbeits-Dokument |
| c | Share-Seite in diesem Vorhaben | **ja** — als Annahme gesetzt (Backend existiert, nur die Seite fehlt), nicht widersprochen | P7 separat lassen |
| d | Visuelle Kapitel | **sichtbar gesperrt mit Begründung + CTA** (wie die gesperrten Gruppen im Dummy); beim Fremdleser ein Satz ohne Preisanker | weglassen bis Produkt 02 |
| e | Export | **Browser-Druck mit Print-CSS** | Server-PDF |

Damit ist das Konzept FREIGEGEBEN für Phase 3 (Prototyp, §2.11). Was noch
Davids Gate bleibt: der Schranken-Text mit Preisanker (G4) und der Richtungen-
Katalog für `result.direction` (G4) — beides erst nach dem Prototyp.

---

## Anhang A — Recherche-Quellen (2026-09-05, Davids Linkliste; abgerufen und zusammengefasst)

| Quelle | Sorte | Kernaussage für uns |
| --- | --- | --- |
| frontify.com/en/lp/ppc-style-guide-v2 · frontify.com/de | Container (Enterprise) | Digitale Richtlinien statt PDF, Live-Publikation, Content-Blöcke für Farbe/Typo/Medien, DAM, Templates, KI-„Brand Assistant", MCP/API; Kunden Uber, Microsoft, Lufthansa; Preis nur per Demo |
| frontify.com/en/guide/brand-guidelines-examples | Ratgeber | 19 Beispiele; Kapitelmuster Vision → Logo/Farbe/Typo → Anwendungen → Tonalität → Downloads; „Online leichter als PDF" |
| corebook.io | Container (KMU/Agentur) | Live-Bearbeitung + Versionen, Tieflinks, Custom Domain, Zugang öffentlich/„Boardroom", MCP für KI-Agenten, Figma-Plugin; Gratis-Test, Tarife Brand Owner/Agentur/Enterprise |
| standards.site | Container (Agentur/Team) | Guidelines-Baukasten (Logo-Dateien, Farbcodes, Schrift-Tests, Downloads), 60+ Marken (Cash App, Mailchimp, Obama Foundation); Gratis-Test, Pro mit 2 Sitzen, Enterprise |
| brandkit.com · brandkit.com/asset-page/703216 | Container (Portal/DAM) + Ratgeber | „One link. Your whole brand": Portal + DAM + Guidelines, Brand Bot; fünf Regeln: Story, Logo-Regeln (inkl. Don'ts), Farben in allen Farbräumen, Typografie mit CSS, Ansprechperson; dazu einfach halten, lebendes Dokument, digital statt PDF |
| brandingstyleguides.com | Galerie | Archiv von ≈ 3.600 Manuals (PDF), Filter Sprache/Jahr/Region/Umfang; Umfang am häufigsten 20–39 Seiten |
| behance.net/search/projects/brand guidelines | Galerie | > 10.000 Projekte, überwiegend „Brand Book"/„Visual Identity"-Präsentationen (Designer-Portfolio-Format) |
| boston.gov …/brand-guidelines | Öffentliche Guidelines (Vorbild) | Kapitel Strategy → Farben → Logo → Typo → Ikonografie → Fotografie → Toolkit → Social → Timeline; Stimme als 5 Prinzipien mit je einem Satz; explizite Don'ts; Downloads |
| adobe.com/express/…/why-you-need-brand-guidelines | Ratgeber + Generator | Nutzen: Wiedererkennung, Effizienz, SEO; Elemente Logo/Palette (1 + 2–4)/max. 3 Schriften; Logo-Generator, Paletten-Tool |
| adobe.com/creativecloud/…/brand-guide.html | Ratgeber | 9 Schritte: Identität/Mission → Name+Claim → Stimme → Personas → Logo → Farbe → Typo → Fotografie → Icons |
| wix.com/blog/style-guide-examples | Ratgeber | 18 Beispiele; Elemente Story → Logo → Farbe → Typo → Bilder → Tonalität → Digital; Don'ts (TripAdvisor, NASA), Inklusion (Destination Canada) |
| blog.hubspot.com/marketing/examples-brand-style-guides | Ratgeber | Logo → Farbe → Typo → Bild/Icons → Voice; Dropbox interaktiv statt PDF; Quick-Access-One-Pager; öffentlich/intern trennen |
| acquia.com/glossary/developing-brand-guidelines | Ratgeber (Enterprise-DXP) | Markenkern zuerst (Mission/Vision/Werte/Zweck), dann Regeln, Schulung, Anpassung, zentrale Ablage (DAM) |
| vistaprint.com/hub/best-brand-guidelines | Ratgeber | Elemente + Gestaltungsrat (Whitespace, Kontinuität); „je detaillierter, desto besser", Klarheit vor Ästhetik |
| bynder.com/en/glossary/brand-guidelines-definition | Ratgeber (DAM-Anbieter) | Definition; Komponenten inkl. **AI-Richtlinien**; PDF veraltet schnell, dynamisch mindestens jährlich prüfen |
| lovable.dev/templates/…/brand-kit-brand-extraction-design-system-template | Generator/Extraktor | URL oder Assets rein → Farben (WCAG), Schriften, Voice & Tone, Tokens (JSON/CSS/Tailwind), PDF, `design.md` für KI-Agenten; öffentliche Share-Links |
| looka.com/blog/15-brand-guidelines-examples… | Ratgeber + Generator | nicht abrufbar (Cloudflare-Sperre); Looka verkauft Logo-Generator + Brand Kit — Sorte 2 |
| squarespace.com/designer/home · …/graphic-designers | Marktplatz/Werkzeug | Designer-Vermittlung bzw. Portfolio/Kundenabwicklung; keine Guidelines — Nähe zur „Creator beauftragen"-Idee |

---

## 7. Nachtrag G1 (2026-09-06) — die `audience`-Zuordnung und drei Entscheidungen

G1 ist gebaut (Registry-Feld `audience`, `sessionTravels` = public UND
foundation als EINE Regel hinter `brandShareableSlotValues`, purer Renderer
`buildBrandFoundation` in `shared/brandFoundation.ts`, 21 neue Prüfungen;
Live-Beweis an der Dev-Instanz: ein frischer Snapshot trägt nur noch
reisefähige Festlegungen). Zuordnung: 31 Sessions `foundation`, 37 `internal`
— Typ-Regel (question/special ⇒ internal, sonst foundation) plus die
Ausnahmetabelle `AUDIENCE_EXCEPTIONS` in `slotRegistry.ts`, die der Test
„bis auf die Ausnahmen" namentlich nagelt. Drei Fälle, die der Agent als
unsicher meldete, entschieden nach dem Konzept:

1. **`d.emotion` (Ziel-Gefühl) ⇒ `foundation`** — §2.2 nennt es als Quelle
   von Kapitel 6; wer im Namen der Marke schreibt, muss es kennen.
2. **`e.composition` (Ton, Länge & Verwendung des Manifests) ⇒ `foundation`**
   — §2.2 nennt es für Kapitel 7; als `choice` ist es ohnehin die Typ-Regel.
3. **`b2.roleOfMaster` ⇒ `internal`** — der alte Registry-Test hielt es auf
   `sensitivity: public`, „weil `b2.rule` darauf verweist"; die FESTLEGUNG ist
   `b2.rule` selbst, die Antwort ist Herleitung. Es darf reisen (public),
   steht aber nicht im Handbuch (audience) — genau die Trennung aus §2.3.

Bewusste Abweichungen des Renderers von der Dummy-Form (Begründung im
Dateikopf): Texte reisen als i18n-SCHLÜSSEL (`labelKey`/`titleKey`,
`brand.foundation.*`), weil Inhaltssprache der Marke ≠ Sprache des Handbuchs;
neue Block-Art `choice` (Archetyp, Architektur-Modell als Ids, die UI löst per
i18n auf); `locked` trägt nur das Element. G2 übernimmt `FdChapter` und
ergänzt den `choice`-Zweig sowie die Schlüssel `brand.foundation.chapter.*`,
`.label.*`, `.column.*`, `.visual.*`.

## 8. Nachtrag G2 (2026-09-06) — Leseansicht gebaut, drei Verträge, eine Druck-Falle

Gebaut: Route `GET /api/brand/profiles/:id/foundation` (404 bei fremdem/
unbekanntem Branding, Werte UNGEFILTERT in den Renderer — das Doppelnetz
§2.8 sitzt im Renderer), Seite `/brand/:id/foundation` mit dem Chrome der
Dokument-Seite, `BwFoundationChapter` (Übernahme des Dummys `FdChapter`
inkl. neuem `choice`-Zweig), „Auf einer Seite", Export-Menü (Drucken frei,
drei Formen gesperrt), Kapitel 10 mit CTA-Paar OHNE Preisanker, Pending-
Vermerk mit Sprung zur Abnahme, 60+ i18n-Schlüssel in de/en mit Wächter
(die Schlüssel werden aus einem echten Renderer-Lauf eingesammelt). Beweis am
Dev-Server mit der Testmarke: eigene Marke 200, fremde 404, ohne Cookie 404,
keine Rohantwort in Antwort oder DOM, Verzeichnis-Sprung + Hervorhebung,
Druck-Emulation ohne Leiste/Verzeichnis/Knöpfe.

Drei Verträge, die dabei entstanden sind:
1. **`BwReadingToc`** ersetzt `BwDocumentToc`: EINE generische Link-Liste
   (`{ id, text, state, counter? }`) für Dokument- UND Foundation-Seite.
2. **Rail-Einstieg** über `useBrandFoundationRailStep` (eine Quelle für
   Werkstatt, Dokument und Foundation): der Ergebnis-Punkt heißt „Brand
   Foundation", hängt hinter „Euer Branding" und ist IMMER erreichbar —
   `BwWorkspaceSidebar` lässt einen `result`-Punkt MIT eigenem `to` immer zu;
   sein Zustand bleibt ehrlich `open`/`active`, kein behauptetes `done`.
3. **`BRAND_FOUNDATION_SOURCE_STEPS`** ordnet jedem Foundation-Kapitel seine
   Quell-Kapitel zu (Story und Visuell leer) — daraus kommen Pending-Vermerk
   und der EINE Zähler.

**Druck-Falle (live erwischt, nicht im Dummy sichtbar):** das Layout
`brand-workspace` setzt `100dvh` + `overflow: hidden`, und das gilt auch auf
Papier — der Druck endete nach der ERSTEN Seite (gemessen 800 px bei 6102 px
Inhalt). Der Dummy hatte kein Layout. Behoben mit einer `@media print`-Regel
IM LAYOUT (height auto, overflow visible); die Seite bleibt für Umbrüche und
Ausblendungen zuständig. Bewusst noch offen (G3): die Ereignisse
`foundation.viewed`/`print.started`, ein „Stand"-Datum im Kopf (die Antwort
trägt keins — nichts erfinden).

## 9. Nachtrag G3 (2026-09-07) — Teilen sichtbar, vier Fallen am Rand

Gebaut: Zustands-Route `GET …/share` (nie ein Token), Teilen-Dialog auf der
Foundation-Seite (Link genau einmal sichtbar, Kopieren, Widerrufen, Rotation
mit echtem Ablaufdatum), öffentliche Seite `/brand/share/:token` (Layout
`false`, schlanker Kopf mit Stand, derselbe Renderer + `BwFoundationChapter
variant="share"`, `BwReadingToc` in `UPageAside`, Drucken, Fuß, `noindex`
+ og aus dem ersten Story-Satz), Ereignisse `foundation.viewed` /
`share.viewed` / `share.revoked` (ohne Token, ohne Inhalt), Alt-Snapshots
werden beim LESEN zusätzlich gefiltert. Beweis: `packages/brand/scripts/
verify-brand-share.mjs` — **36/36**, Gegenprobe `VERIFY_EXPECT_LEAK=1` ⇒
**31/36 rot** (das Skript beißt). Prod-Bestand `brand_shares` vor dem
Deploy: **0 Zeilen** — nichts zu widerrufen (§4 erledigt).

Vier Fallen, alle live erwischt:
1. **`frame-ancestors 'none'` ist über `registerEmbeddableRoute` nicht
   ausdrückbar**, und ein Header aus Seite oder Middleware verliert gegen den
   Core-Default `'self'` im `render:response`-Hook. Lösung: eine zweite,
   gleichrangige Registry `registerFrameDeniedRoute(prefix)` in
   `core/server/utils/frameAncestors.ts`, im Resolver ZUERST geprüft (Verbot
   schlägt Erlaubnis; Locale-Präfix wird abgestreift). Unit-Test in core +
   Live-Zusage im Skript, mit Gegenprobe: die private Seite behält `'self'`.
2. **`Cache-Control: no-store` kam nicht an**: `core/server/plugins/
   html-no-cache.ts` setzt im Render-Hook `no-cache`, wenn `response.headers`
   nichts trägt — ein per Middleware am EVENT gesetzter Header stand dort
   nicht und verlor. Der Plugin übernimmt jetzt, was am Event steht, und
   greift erst ohne alles zum Default. (Core-Änderung, eigener Commit.)
3. **Zwei Schreibweisen für denselben Augenblick**: Appwrite gibt
   Zeitstempel als `+00:00` zurück, die Publish-Antwort schreibt `Z`. Die
   Zustands-Route normalisiert auf `toISOString()`, sonst vergleicht ein
   Client Zeichenketten und sieht zwei Fristen.
4. **`print.started` gibt es nicht**: der brand-Layer hat keinen
   Telemetrie-Endpunkt, und eine POST-Route nur für einen Zähler wäre mehr
   Tür als Nutzen — bewusst weggelassen; das Drucken zählt über
   `foundation.viewed` mit.

Bewusst offen: ein „Stand"-Datum im Kopf der PRIVATEN Seite (die Antwort
trägt keins, nichts erfinden) — kommt, sobald die Route die letzte Abnahme
meldet. Nächstes Paket G4 (Schranke + Richtung) bleibt an Davids Gate:
Schranken-Text mit Preisanker und Richtungen-Katalog.

## 10. Nachtrag G5 (2026-09-07) — die Beispiel-Foundation ist eine echte Seite

`/beispiel/kailua-coffee` auf branding.supply (indexierbar, Marketing-Layout
mit Site-Nav, SEO-Meta, Drucken, CTA „Starte dein Branding") rendert den
festen Snapshot `packages/brand/shared/examples/kailuaCoffee.ts`
(`BrandFoundationInput`, 27 reisefähige Slots in sechs Kapiteln, Werte über
die Format-Schreiber gebaut, keine internen Slots — 14 Prüfungen inkl.
Schmuggel-Gegenprobe) über DENSELBEN Renderer und dieselben Komponenten wie
Share- und Foundation-Seite (`variant="share"`). Die Startseite hat ihren
Beispiel-Teaser zurück (Sektion 3, hinter den Artefakten als deren Beweis).
Davids Gate bleibt der INHALT der Beispielmarke — die Texte stammen aus dem
abgenommenen Dummy und wurden im selben Ton ergänzt. Bewusst ohne Bilder (nur
der Kailua-Farbverlauf), ohne Sitemap (die App hat keine — Vermerk im
Seitenkopf), ohne `result.direction` (G4).

## 11. G4 — Entscheidungen (David, 2026-09-07, alle nach Empfehlung)

| # | Frage | Entscheidung |
| --- | --- | --- |
| a | Richtungen-Katalog | kuratierter Katalog im brand-Layer: sechs Richtungen (Name, Begründungsregel je Archetyp, Farbwelt aus den 12 Dreiklängen, Schriftpaar aus der Font-Registry), Vorschau als Anwendungs-Ausschnitt mit lokalen CSS-Variablen, keine iframes; `presetId`/`presetVersion` reisen mit, damit Themes-Engine-Presets später ersetzen können |
| b | Auswahl | drei Richtungen, passend zu Haupt-/Nebenarchetyp, pure Regel mit Begründung |
| c | Preisanker | keiner — Studio-Angebot, Erstgespräch ist der Weg |
| d | Ort der Wahl | Ergebnis-Kapitel der Werkstatt (`result.direction`, Karten-Editor); Kapitel 10 der Foundation zeigt die Wahl (`swatches`-Block) und gibt sie in den Snapshot |

## 12. Nachtrag G4 (2026-09-07) — die Richtung ist gewählt, die Schranke steht

Gebaut nach §11: Katalog `shared/brandDirections.ts` (sechs Richtungen,
Farbwelt aus den kuratierten Dreiklängen, Schriftpaare als eigene Strings —
KEIN Import aus themes, A14), pure Regel `suggestBrandDirections` (drei je
Archetyp-Paar: beide → Haupt → Neben → Katalog-Reihenfolge; jeder der zwölf
Archetypen in genau drei Richtungen — die Paket-Skizze „3–5 je Richtung" war
mit sechs Richtungen arithmetisch unerfüllbar, jetzt 5–7 je Richtung), Karten
`BwDirectionCard` als Anwendungs-Ausschnitt mit lokalen CSS-Variablen ohne
Web-Schriften, Weiche im bestehenden Karten-Editor der Werkstatt, Werkstatt
kennt die Archetypen des Profils über das neue Feld `sourceValues`
(`BRAND_STAGE_SOURCE_SLOTS`). **Eine Wahrheit:** der bestätigte Slot-Wert
`result.direction`; `foundation.get` und `share.post` lesen ihn und lassen nur
Katalog-bekannte Ids durch; `brand_profiles.designPresetId/-Version` bleiben
unbeschrieben, bis Themes-Engine-Presets sie brauchen. Kapitel 10 rendert
`direction` + `swatches` VOR den fünf gesperrten Elementen und bleibt `locked`;
der Knopf heißt „Richtung wählen"/„Richtung ändern" (Ziel
`/brand/:id/result?s=result.direction`, gesperrt mit Hinweis, solange die
Vorgänger nicht abgeschlossen sind — Zustand aus der Journey, nicht aus
`storedState`), daneben das Erstgespräch; Schranken-Satz ohne Preis (§11 c).
Beispiel Kailua trägt `warm-editorial`. Beweis am Dev-Server: Karten mit
Begründung („passt zu Haupt- und Neben-Archetyp") → Bestätigen → Kapitel 10
zeigt Richtung, Farbwelt, Schriftpaar, Angebotssatz und „Richtung ändern" →
Snapshot `presetId: warm-editorial, presetVersion: 1` → Share-Seite zeigt die
Richtung. 1967 Tests grün.

**Damit ist BF1 vollständig gebaut (G1–G5).** Offen sind Davids Blicke auf
Leseansicht, Teilen, Beispiel-Inhalt und Richtungswahl.
