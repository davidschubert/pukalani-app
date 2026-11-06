# Brand Design (Produkt 02) — Strategie und Konzept

> **AUSGEFÜHRT — Archiv seit 2026-09-09.** Strategie freigegeben 2026-09-07, Konzept
> freigegeben 2026-09-07, Prototyp freigegeben 2026-09-08, Pakete D0–D9 + Nachschnitt +
> Audit-Paket A1 gebaut, geprüft und live (Build d4f17df6), **von David abgenommen
> 2026-09-09** („ich vertraue dir erstmal hier" — Inhalts-Gates D1–D8 gelten als
> abgenommen, Korrekturen laufen als gewöhnliche Befunde über OPEN-ITEMS). Eintrag mit
> Gelernt: docs/OPEN-ITEMS-COMPLETE.md. Offene Reste gibt es hier keine.

Phase 1 des Workflows (docs/referenz/WORKFLOW.md), Stand 2026-09-07 —
FREIGEGEBEN mit Davids Entscheidungen in §1.11. Phase 2 (Konzeption, §2) ist
seit 2026-09-07 FREIGEGEBEN (§2.19 nach Empfehlung); Phase 3 (Prototyp im
Playground) ist gebaut (§3) und seit 2026-09-08 freigegeben, eingefroren.
---

## 0. Was das hier ist

Der Strang „Brand System" (OPEN-ITEMS, Davids Entscheidung 2026-09-05) läuft
BF1 Foundation-Leseansicht → **Produkt 02 Brand Design** → Produkt 03 Book &
Kit. BF1 ist seit 2026-09-07 abgenommen; Brand Design ist der nächste
Schritt. Dieses Dokument ist die Bestandsaufnahme: wo kommen wir her, wo
stehen wir, wo wollen wir hin — mit Konkurrenz, technischer Ausgangslage,
Hypothesen und offenen Entscheidungen. Die Konzeption (Verträge, Datenmodell,
Oberfläche, Pakete) folgt als §2 in dieser Datei, sobald David die Fragen in
§1.10 beantwortet hat.

---

## 1. Strategie

### 1.1 Wo kommen wir her

Was das Projekt zu Brand Design schon FESTGELEGT hat (nichts davon ist neu zu
entscheiden):

- **Die Produktentscheidung (2026-08-27):** das Fundament ist frei, die
  Ableitung bezahlt. Brand Design ist die erste bezahlte Ableitung.
- **Die Suite (Phase-1-Plan §5b, 2026-08-30):** Produkt 02 macht „aus der
  Foundation DREI Moodboards; iterative Verfeinerung nach Agentur-Art: Haken
  an Gefallendes, Kommentar/Edit an den Rest, MIX & MATCH über Boards —
  ‚Farbwelt aus 1, Typografie aus 3'; Grundlage ist die Visual DNA."
- **Die Design-Schicht im Dummy (Phase-1-Plan §5b „Schritt-Schnitt"):** ~15
  Entscheidungen, ~35 Minuten, fünf Schritte — Farbwelt (Basisfarbe aus
  Archetyp + Werten, Hell-/Dunkel-Rampe mit Kontrast-Paaren, „die
  Themes-Engine nativ") · Typografie (Rollen, Grade, Hierarchie) · Logo &
  Zeichen (Wort-/Bildmarke, Varianten, Schutzraum) · Bildsprache &
  Ikonografie · Motion (Tempo, kinetisches Logo, reduced-motion). Im Rail der
  Werkstatt steht die Schicht seit dem Klickdummy als gesperrte Gruppe mit
  genau diesen Erklär-Texten (`demoRail.ts`).
- **Zwei Taxonomien (Davids Notizen 2026-08-30):** die Sechs-Achsen-Taxonomie
  (Archetyp ≠ visueller Stil — Kernregel: Achsen nie vermischen) und die
  **Visual Brand DNA** mit ~10 orthogonalen Dimensionen (Visual Style,
  Aesthetic Era, Form Language, Typography, Color Character, Imagery,
  Composition, Materiality, Motion Character, Overall Mood). Ein Moodboard ist
  eine KOMBINATION dieser Eigenschaften, keine Kategorie. Die Pipeline ist der
  Wert: **Brand Psychology → Visual DNA → Design Direction → Design System.**
  Vorgemerkt: eigener Schritt „Moodboard" am Anfang von Brand Design.
- **Was schon steht, weil BF1 es vorgezogen hat (G4, 2026-09-07):** der
  kuratierte **Richtungen-Katalog** (`shared/brandDirections.ts`, sechs
  Richtungen, drei je Archetyp-Paar, Farbwelt aus zwölf Dreiklängen,
  Schriftpaar-Namen), die Wahl als Session `result.direction`, Kapitel 10 der
  Foundation zeigt sie, der Snapshot trägt `presetId/presetVersion`. Davids
  Entscheidung dazu: der Katalog ist ein INTERIM, „später durch Themes-Engine-
  Presets ersetzbar" — genau diese Ablösung ist Brand Design.
- **Das Beispiel (Kailua Coffee Co., Dummy `beispiel.vue`):** Farbwelt
  Roast/Crema/Milk/Palm/Paper mit Rollen, Typografie „warme Serif +
  humanistische Grotesk + Mono für Herkunft und Preise", Wortmarke mit
  Wellenpunkt, Fotografie „Tageslicht, Hände, Herkunft — nie Stock-Lächeln",
  Motion ruhig (200 ms, Logo bewegt sich nicht), dazu eine Visual-DNA-Zeile.
  Das ist die abgenommene FORM des Ergebnisses.
- **Der Brand-Check** bewertet „Visuelle Identität" mit Gewicht 15 von 100 und
  kann für eine Foundation ohne Website nur „nicht bewertbar" sagen — Brand
  Design ist das, was diese Kategorie füllt.
- **Die Startseite** verspricht Design-Tokens „hell/dunkel, Kontrast-geprüft —
  CSS, Tailwind, Figma" (als Artefakt von Produkt 03) und nennt Brand Design
  im Prozess-Theater. Das Team kennt eine Design-Beraterin (Frida Martens).

### 1.2 Wo stehen wir

- Zwischen der fertigen Foundation und dem versprochenen Book & Kit steht
  heute NICHTS Visuelles außer der Richtung aus G4: drei Swatches und zwei
  Schriftnamen, die nicht einmal geladen werden (bewusst — „eine Richtung,
  kein Rendering-Beweis").
- Die **Themes-Engine** (Layer `themes`, docs/referenz/THEMES-CONCEPT-V2.md)
  kann genau das, was Farbwelt und Typografie brauchen: Ramp aus EINER
  Basisfarbe (OKLCH, `generateRamp`, auf Tailwind v4 kalibriert, 30+ Tests),
  getönte **Neutral-Ramp** (`generateNeutralRamp`), **Kontrast-Gate**
  (`contrastRatio`, `wcagLevel`), Hell/Dunkel als Varianten, kuratierte
  **Schriftpaare** (Inter, Humanist, Editorial, Geometrisch, Klassisch — self-
  hosted über `@nuxt/fonts`, Regel „maximal drei Schriften"), sogar
  **Font-Upload** (Bucket `fonts`, WOFF2, `custom_fonts`). Aber: sie arbeitet
  für COMMUNITIES und INSTANZEN (`custom_themes`, `data-theme` am `<html>`),
  nicht für ein Brand-Profil. Der Phase-1-Plan hat diese Grenze schon
  benannt: „Themes wirken global auf `:root`, drei parallele Richtungen
  brauchen je ein lokales Preview-`iframe`" (Technik-Vertrag Audit 3), und
  der explizite Themes-Vertrag (A14) „liefert NUR validierte Presets; die
  Engine bleibt unverändert."
- **Zeichen:** `themes/shared/brandMark.ts`/`brandIcon.ts` erzeugen heute
  Initial-Marken für Communities (Kreis + Initial in der Primärfarbe, als
  Favicon/App-Icon), `brandCard.ts` rastert eine Wortmarke ins og-Bild mit
  einem gebackenen Font-Atlas. Ein Logo-Werkzeug ist das nicht — aber es
  zeigt: Monogramm und Wortmarke aus Farbe + Schrift sind im Haus.
- **Bildsprache und Motion:** nichts, außer dem Beispiel-Text und den
  Rail-Erklärungen.
- **Extraktion für Bestandsmarken:** die URL-Analyse (brand-010) und der
  Brand-Check lesen Text, Meta und Struktur — Farben und Schriften einer
  bestehenden Website werden heute NICHT ausgelesen. Davids Strategie-Text
  (2026-09-05) will genau das als Relaunch-Einstieg („Website → verstehen →
  extrahieren → bewerten → verbessern").
- **Bezahlung:** branding.supply läuft im Beta-Modus per Einladung, ohne
  Stripe. Die Platform hat Stripe (Community-Abos, Checkout, Webhook); der
  brand-Layer hat keinen Geldpfad.

### 1.3 Wo wollen wir hin — das Zielbild in einem Satz

**Brand Design macht aus der Foundation eine visuelle Identität als
DESIGN-SYSTEM, nicht als Bildergalerie:** Farbwelt (Basisfarbe + hell/dunkel
Ramp, Kontrast-geprüft), Typografie (Paar + Hierarchie), Zeichen (Richtung
für Wort-/Bildmarke plus Regeln), Bildsprache und Motion als Regeln mit Do &
Don't — je Schritt ein Vorschlag aus der Visual DNA mit Begründung, Auswahl
aus drei, Mix & Match über Boards; das Ergebnis füllt Kapitel 10 der
Foundation, wird zum Preset im Snapshot und ist der Input von Produkt 03.

Der Unterschied zu allem, was der Markt verkauft (§1.7): die Optik wird aus
der Strategie HERGELEITET und begründet („für euren Archetyp untypisch,
DESHALB eigenständig"), nicht aus Name + Branche gewürfelt. Design =
Entscheidungen, nicht Generator (Startseiten-Satz „Marken sind keine
Vorlagen").

### 1.4 Was das Produkt BEWUSST NICHT behauptet

- **Kein fertiges Logo per KI-Bild als „euer Logo".** Bildlogos aus
  Diffusionsmodellen sind markenrechtlich riskant (Ähnlichkeit,
  Schutzfähigkeit) und qualitativ unberechenbar — die Empfehlung war, sie
  wegzulassen. **David hat anders entschieden (§1.11 b, Stufe 3):** es gibt
  einen Bereich für KI-Bildlogos auf Basis von Richtung und Briefing — als
  gekennzeichnete ENTWÜRFE für die Designer-Arbeit, mit Herkunft, außerhalb
  von Snapshot und Share, mit Markenrechts-Hinweis. Was das Produkt weiterhin
  nicht behauptet: dass ein solcher Entwurf ein schutzfähiges, fertiges Logo
  ist. Die Ausarbeitung bleibt Designer-Arbeit (Studio, Erstgespräch).
- **Keine generierten Fotos.** Bildsprache sind Prinzipien und Do/Don't
  (plus Prompt-Vorlagen für Produkt 03/04), keine Stock- oder KI-Bilder.
- **Kein DAM, keine Vorlagen, keine Website** — Produkt 03/04.
- **Keine Ersetzung der Themes-Engine** — sie wird Konsument-seitig
  angesprochen (Presets), nicht umgebaut (A14).

### 1.5 Zielgruppe und Nutzen

| Wer | Nutzen von Brand Design | Woran wir es messen |
| --- | --- | --- |
| Gründerin ohne Designer (Weiche „Neue Marke") | Am Ende STEHT etwas Anwendbares: Farben mit Codes, Schriftpaar, Wortmarke gesetzt, Regeln — morgen in Website und Social benutzbar | Anteil der Foundations, die Brand Design starten und abschließen; Export/Tokens-Nutzung (Produkt 03) |
| Unternehmen im Relaunch (Weiche „Marken-Relaunch") | Der Ist-Zustand wird gelesen (Farben/Schriften der Website), Brand Design sagt, was bleibt und was sich ändert („Evolution statt Revolution", Serifen-Artikel) | Relaunch-Starts nach Brand-Check; Delta „Visuelle Identität" im Score vorher/nachher |
| Studio-Kunde (Enterprise = Studio) | Vorarbeit, die der Designer nicht mehr erfragen muss: DNA, Richtung, Farbwelt, Typo-Rollen — das Briefing ist das Ergebnis | Erstgespräche aus Kapitel 10; Zeit bis zum ersten Design-Entwurf |

### 1.6 Technische Ausgangslage — was wir NICHT neu bauen

| Baustein | Existiert | Was Brand Design daraus macht |
| --- | --- | --- |
| Ramp + Kontrast + Neutral | `themes/shared/ramp.ts`, `oklch.ts` (pur, getestet) | Farbwelt-Schritt rechnet je Vorschlag Ramp hell/dunkel und prüft Kontrast-Paare — ohne Engine-Umbau, über den Preset-Vertrag |
| Schriftpaare + Self-Hosting | `FONT_FAMILY_REGISTRY`, `fonts.css`, `@nuxt/fonts`; Font-Upload WOFF2 | Typografie-Schritt wählt aus kuratierten Paaren (Regel „max. drei"), Vorschau lädt ECHTE Schriften — anders als G4 |
| Wortmarke/Monogramm | `brandMark.ts`, `brandIcon.ts`, `brandCard.ts` (Atlas-Raster) | Zeichen-Schritt setzt Wortmarke + Monogramm aus Schriftpaar und Farbwelt als SVG (Varianten, Schutzraum-Regel) |
| Richtungen-Katalog (G4) | `brandDirections.ts`, `result.direction`, Kapitel 10, Snapshot-Preset | Wird zum Moodboard-Einstieg: die gewählte Richtung ist die Vorbelegung der DNA; der Katalog wächst zu Presets |
| Visual-DNA-Notiz | Phase-1-Plan §5b | Wird Datenmodell: ~10 Dimensionen mit kontrollierten Vokabularen, KI-Vorschlag mit Begründung, je Dimension bestätigbar |
| Werkstatt-Mechanik | Sessions, Zustandsmaschine, Abnahme, Korrektur-Regel, Berater (BW2) | Brand Design = neue Kapitel derselben Werkstatt (Schicht 2), Beraterin Frida, KEINE zweite Werkstatt |
| Foundation-Renderer | `buildBrandFoundation`, Kapitel 10, `swatches`/`direction`-Blöcke | Kapitel 10 wird VOLL: Farbwelt, Typo, Zeichen, Bild, Motion als Blöcke — die Schranke fällt |
| Beweis-Werkzeuge | verify-Skripte, Playwright, Testmarke | Wie BF1 |

### 1.7 Konkurrenz und Referenzen (Recherche 2026-09-07, Quellen in Anhang A)

Drei Sorten — und keine leitet Design aus einer Strategie her:

1. **Logo-Generatoren mit „Brand Kit"** — Looka, Brandmark, LogoAI, Tailor
   Brands. Eingabe: Name + Branche + Stilpräferenz, Ausgabe in Sekunden:
   Logo-Varianten, Palette, Schriften, Social-Vorlagen, ein „Brand Guide".
   Geschäftsmodell einmalig (Brandmark, Looka-Logo-Paket) oder Abo (Looka
   Brand Kit; Tailor Brands 0 / 199 / 249 $ pro Jahr als „Business-in-a-box"
   mit Domain und Website). Millionen Nutzer, Zielgruppe „I'm not a
   designer". Qualität: austauschbar, ohne Begründung, ohne Strategie.
2. **Werkzeuge für Designer** — Huemint (ML-Paletten mit Kontrast-Matrix und
   Lock, trainiert auf 1,2 Mio. Designs, frei), Fontjoy (Deep-Learning-
   Schriftpaare, frei), Realtime Colors (Palette + Schriften auf einem ECHTEN
   Layout hell/dunkel, Export CSS/Tailwind/Figma, frei, 300 k Nutzer),
   Lovable Brand Kit Extractor (URL → Farben/Schriften/Tokens/`design.md`).
   Alles Commodity: Palette und Paarung kosten nichts mehr — der Wert liegt in
   Herleitung, Begründung und System.
3. **Container** — Canva Brand Kit (Farben, Schriften, Logos, Vorlagen im
   Pro-Plan), Frontify/Corebook° (Guidelines-Verwaltung, s. BF1-Konzept
   §1.5). Sie verwalten, was andere entschieden haben.

**Was wir daraus machen:**

| Marktbefund | Folge für Brand Design |
| --- | --- |
| Vorschau auf ECHTEM Layout schlägt Farbfelder (Realtime Colors; Phase-1-Plan §3d Nr. 7 sagt dasselbe: „Website-Hero, Überschrift+Fließtext, Button, Zitat, Farbrampe") | Jede Richtung/Farbwelt wird als Anwendungs-Szene gezeigt, hell UND dunkel — mit den ECHTEN Schriften |
| Kontrast als Erstklasse-Eigenschaft (Huemint-Matrix, Realtime Colors AA/AAA) | Kontrast-Paare sind Teil des Vorschlags, nicht ein Prüfschritt danach — die Engine kann es |
| Lock + Regenerate als Bedienmuster (Huemint, Fontjoy) | „Haken an Gefallendes, Rest neu" = Davids Mix & Match; je Dimension festhalten, Rest neu vorschlagen |
| Logo-Erwartung ist massiv (jeder Wettbewerber startet beim Logo) | Ohne ein sichtbares ZEICHEN wirkt Brand Design unvollständig — deshalb mindestens Wortmarke/Monogramm-Setzung (Frage b) |
| Export ist Standard (Tailwind/CSS/Figma bei den Freien) | Tokens gehören zu Produkt 03; Brand Design muss sie aber ERZEUGEN (dieselben Werte), sonst ist 03 leer |
| Alle starten bei Name + Branche | Wir starten bei Archetyp, Werten, Stimme, Positionierung — die Begründung ist das Produkt |

### 1.8 Geschäftsmodell-Einordnung

Brand Design ist die erste BEZAHLTE Stufe. Zwei Wege sind denkbar, und die
Wahl prägt das Konzept (Frage §1.10 d):

- **Studio-begleitet zuerst:** Brand Design läuft in der Werkstatt, wird
  aber pro Marke vom Studio freigeschaltet (nach Erstgespräch), Ergebnis geht
  in Designer-Arbeit über. Kein Stripe im brand-Layer, kein Preis auf der
  Seite (passt zur G4-Entscheidung „kein Preis, Studio-Angebot"), Beta-Logik
  wie heute. Lernt am Kunden, bevor Selbstbedienung skaliert.
- **Selbstbedienung mit Kauf:** Freischaltung per Checkout (Stripe existiert
  in der Platform, müsste in den brand-Layer/branding), Preis auf Kapitel 10
  und Startseite. Skaliert, verlangt aber Rechtstexte, Rückerstattung,
  Support — und eine Qualität, die ohne Designer trägt.

**Nachtrag 2026-09-08 (David):** Brand Design wird als **eigenständiges
Produkt neben der Brand Foundation** angeboten und verkauft — die
Vorbilder-Lesung gegen die Foundation gibt es so am Markt nicht (§1.7: die
Generatoren starten bei Name + Branche, die Werkzeuge kennen keine
Strategie, die Container bewerten nichts). Was daraus folgt: (1) die
Foundation bleibt Voraussetzung — „die Grundlage für alles"; wer nur Brand
Design kauft, durchläuft die Foundation zuerst (frei, ~45 Min; bei
Bestandsmarken der Relaunch-Weg mit Brand-Check als Einstieg). (2) Fassung
1 bleibt Studio-begleitet ohne Preis (§1.11 d); der Verkauf als
Selbstbedienung ist der zweite Schritt und braucht Stripe im brand-Layer,
Rechtstexte und die Qualität, die ohne Designer trägt — eigene Zeile in
OPEN-ITEMS, sobald die Beta die Hypothesen H1–H7 beantwortet hat.

### 1.9 Risiken und Hypothesen (was die Konzeption/Beta klären muss)

- **H1 Sehen schlägt Wählen:** Nutzer entscheiden erst, wenn sie ihre Marke in
  einer Szene sehen (Hero, Karte, Knopf, Zitat) — nicht an Swatches. Folge:
  Szenen-Vorschau ist Pflicht, iframes oder lokale CSS-Variablen (G4 hat
  lokale Variablen bewiesen; drei parallele Szenen brauchen keinen `:root`).
- **H2 Logo-Loch:** ohne gesetztes Zeichen fühlt sich das Ergebnis leer an;
  mit KI-Bildlogos verkaufen wir Risiko. Wortmarke/Monogramm aus dem eigenen
  Schriftpaar ist der ehrliche Mittelweg — zu prüfen an fünf Testmarken.
- **H3 Schriften:** Self-Hosting per Build erlaubt nur kuratierte Familien;
  ~6 Paare reichen für die Beta, Font-Upload ist der Ausweg für Marken mit
  eigener Schrift.
- **H4 KI-Herleitung:** die DNA-Vorschläge müssen an der Foundation hängen
  (Archetyp, Werte, Ton-Wörter, Positionierung) und begründet sein — sonst
  sind wir Brandmark. Messbar wie beim Wizard: `generation.*`-Ereignisse,
  Korrekturrate je Dimension.
- **H5 Zeit:** ~35 Minuten für fünf Schritte sind viel nach 45 Minuten
  Foundation — Moodboard zuerst (eine Wahl, die die anderen vorbelegt) muss
  die Schritte auf Bestätigungen verkürzen.
- **H6 Relaunch braucht den Ist-Zustand:** Bestandsmarken erwarten, dass wir
  ihre Farben/Schriften KENNEN — die Extraktion (Farben aus CSS, Schriften aus
  `font-family`, Logo-Datei) fehlt und ist ein eigener Baustein.
- **H7 Zwei Welten:** die Themes-Engine denkt in Community/Instanz; ein
  Brand-Preset darf sie nicht anfassen — sonst kollidieren Layer-Grenzen und
  Mandanten-Regeln. Der Preset-Vertrag muss VOR dem Bau stehen.

### 1.10 Fragen an David (die Konzeption braucht sie)

| # | Frage | Empfehlung | Alternative |
| --- | --- | --- | --- |
| a | Umfang der ersten Fassung | **Moodboard + Farbwelt + Typografie + Zeichen-Richtung** (vier Schritte; Bildsprache und Motion als Regeln mit Do/Don't im selben Lauf, aber ohne eigene Vorschau) | alle fünf Schritte gleich tief; oder nur Farbwelt + Typografie |
| b | Das Zeichen | **Wortmarke + Monogramm aus dem Schriftpaar setzen** (SVG, Varianten, Schutzraum-Regel), Bildmarke nur als Richtung + Briefing | nur Richtung/Briefing ohne Setzung; oder KI-Bildlogos (abgeraten, §1.4) |
| c | Vorschau | **Anwendungs-Szenen mit lokalen CSS-Variablen und echten Schriften**, hell und dunkel, drei nebeneinander | Themes-Engine-Preview-iframes (echter, größer) |
| d | Geschäftsmodell der ersten Fassung | **Studio-begleitet, Freischaltung je Marke, kein Preis** (wie G4) | Selbstbedienung mit Stripe-Checkout und Preis |
| e | Wo lebt es | **Schicht 2 derselben Werkstatt** (Kapitel nach der Foundation, Beraterin Frida, gleiche Zustandsmaschine) | eigener Layer `design` (Silo-Regel: neues Produkt ⇒ eigener Layer — zu prüfen gegen „eine Werkstatt") |

### 1.11 Entscheidungen (David, 2026-09-07, Fragenrunde) — die Strategie ist damit FREIGEGEBEN

| # | Frage | Entscheidung | Einordnung |
| --- | --- | --- | --- |
| a | Umfang | **Alle fünf Schritte gleich tief** — Moodboard/DNA, Farbwelt, Typografie, Zeichen, Bildsprache UND Motion je mit eigener Vorschau | GEGEN die Empfehlung (vier Schritte). Folge für die Konzeption: Bild-Prinzipien brauchen Beispiel-Darstellung (keine generierten Fotos, §1.4 bleibt), Motion braucht eine Demo (Tempo, Übergänge, reduced-motion) — beides mit Vorschau-Szene. Zeitbudget ~35 Min hält nur, wenn das Moodboard die Schritte auf Bestätigungen verkürzt (H5). |
| b | Zeichen | **Drei Stufen in dieser Reihenfolge:** (1) Richtung + Briefing (Wort-/Bild-/Kombinationsmarke, Charakter, Schutzraum-Regel), (2) darauf aufbauend BEISPIELE für Wortmarken + Monogramme gesetzt (aus Schriftpaar + Farbwelt, SVG, Varianten), (3) dazu ein BEREICH, in dem KI-Bildlogos auf den zuvor erstellten Inhalten erzeugt werden | Stufe 3 GEGEN die Empfehlung (§1.4). Davids Entscheidung — mit diesen Leitplanken, die die Konzeption einlösen muss: KI-Bildlogos sind als ENTWURF gekennzeichnet („Ideen für den Designer", nicht „euer Logo"), tragen Herkunft (Modell, Datum), reisen NICHT in Foundation-Snapshot/Share, bis ein Mensch eines übernimmt; Bildmodelle laufen über denselben Transport wie die Text-KI (`aiComplete`-Familie, NUXT_AI_KEY, ZDR-Routing wie beim Wizard) und mit Drosseln; Markenrecht ist Hinweis im UI, keine Prüfung. |
| c | Vorschau | Anwendungs-Szenen mit lokalen CSS-Variablen und ECHTEN Schriften, hell und dunkel, drei nebeneinander | Annahme, nicht widersprochen. |
| d | Geschäftsmodell | **Studio-begleitet, ohne Preis** — Freischaltung je Marke durch das Studio nach dem Erstgespräch, kein Stripe im brand-Layer | nach Empfehlung; passt zu G4 („kein Preis, Studio-Angebot"). |
| e | Ort | **Schicht 2 derselben Werkstatt** — neue Kapitel nach der Foundation im brand-Layer, Beraterin Frida, dieselbe Zustandsmaschine/Abnahme/Korrektur-Regel | nach Empfehlung; die Silo-Regel „neues Produkt ⇒ eigener Layer" wird bewusst NICHT angewandt, weil Brand Design dieselbe Werkstatt und dasselbe Dokument fortsetzt (Begründung ins DECISION-LOG). |

Nächste Phase: **Konzeption** (§2 in dieser Datei) — Verträge für DNA-
Datenmodell, Preset-Vertrag zur Themes-Engine, Kapitel/Sessions der
Schicht 2, Zeichen-Stufen inkl. KI-Bildlogo-Bereich mit Leitplanken,
Vorschau-Szenen, Freischaltung, Messung, Pakete.

---

## 2. Konzeption (Phase 2, 2026-09-07 — zur Freigabe)

Alles hier folgt den Entscheidungen in §1.11. Offene Punkte stehen als
Fragen in §2.19, nicht als Vorbehalt im Text.

### 2.1 Produktform: Schicht 2 derselben Werkstatt

- **Sechs neue Kapitel** hinter der Foundation, additiv in `BRAND_STEP_KEYS`
  (Registry-Ids ändern sich nie; die Fassung bleibt 1, weil Hash-Inputs nur
  Werte lesen): `dna` (Moodboard), `color` (Farbwelt), `type` (Typografie),
  `mark` (Zeichen), `imagery` (Bildsprache & Ikonografie), `motion`. Je
  Kapitel eine `brand_steps`-Zeile wie heute (`uq_profile_step` trägt das
  schon), Sessions nach dem BW2-Vertrag (`defineSession`, Ziel, Leiter,
  Form, Invarianten, `audience`, `sensitivity`), Abnahme je Kapitel,
  Prüfblick, Korrektur-Regel — NICHTS Neues an der Zustandsmaschine.
- **Beraterin Frida Martens** (`brandAdvisors.ts`, `steps: [dna, color,
  type, mark, imagery, motion]`), Tonalität wie die Crew, eine Stimme (George
  bleibt Gastgeber). Ihre Leitern und Zielsätze sind Davids Inhalts-Gate wie
  in BW2 Paket 2.
- **Gating:** Schicht 2 öffnet, wenn (a) die Foundation ihr Ergebnis-Kapitel
  abgeschlossen hat (`result` done, inkl. `result.direction`) UND (b) die
  Marke **freigeschaltet** ist (§2.10). Vorher bleibt der Rail-Layer „Brand
  Design" gesperrt mit dem heutigen Erklär-Text.
- **Ort in der Oberfläche:** dieselbe Werkstatt-Route `/brand/:id/<stepKey>`,
  derselbe Rail (Layer „Brand Design" wird zum echten Layer mit sechs
  Einträgen), dasselbe Dokument („Euer Branding" bekommt die sechs Kapitel),
  dieselbe Foundation-Leseansicht (Kapitel 10 wird VOLL, §2.8).

### 2.2 Kapitel `dna` — Richtung aus zwei Quellen: Foundation und Vorbilder (Davids Entscheidung 2026-09-08)

**Der Grundsatz (David):** „Niemand fängt mit der Palette an. Vor Farbe und
Schrift steht immer eine Richtung — aus der Strategie UND aus Vorbildern, die
der Kunde mitbringt." Kunden haben heute Pinterest-Boards und Screenshots
und wissen, welche Visualität ihre Marke annehmen soll. Kapitel 1 nimmt
deshalb BEIDE Quellen: die Brand Foundation (Archetyp, Werte, Ton-Wörter,
Positionierung) und **Vorbilder je Bereich** (Farbwelt, Typografie, Zeichen,
Bildsprache — optional Komposition/Motion). Die Foundation bleibt die
Grundlage für alles: Vorbilder werden AN IHR GEMESSEN, nicht übernommen.

**Ablauf des Kapitels:**

1. **`g.source`** (choice): „Habt ihr Vorbilder?" — Ja ⇒ Upload, Nein ⇒
   direkt zum Vorschlag. Beide Wege enden in derselben DNA; der Unterschied
   ist die Quelle, nicht die Reihenfolge (das Moodboard steht in beiden
   Fällen VOR Farbwelt und Typografie; ein „Moodboard am Ende" ist kein
   Entscheidungsschritt, sondern das Ergebnis-Board, §2.8).
2. **`g.inspiration`** (special, Editor `uploads`): 3–12 Screenshots (PNG/
   JPG/WebP, ≤ 5 MB, Magic-Bytes), je Bild ein BEREICH als Chip (Farbwelt ·
   Typografie · Zeichen · Bildsprache · Komposition) und optional ein Satz,
   warum es gefällt. Ablage im Bucket `brand-inspiration` (permissions [],
   server-only, Auslieferung nur an den Besitzer), Tabelle
   `brand_inspiration` (profileId, fileId, area, note, `reading` JSON,
   createdAt). Die Bilder bleiben PRIVAT: sie reisen nie in Snapshot, Share,
   Beispiel oder Dokument.
3. **`g.reading`** (derivation, Vision-Modell): je Bild eine strukturierte
   LESUNG in der DNA-Sprache — beobachtete Werte je Dimension (z. B. „Farb-
   Charakter: erdig gedämpft", „Typografie: buchhafte Serif"), erkannte
   Merkmale (Kontrast, Rundung, Bildstil), und die **Bewertung gegen die
   Foundation**: `fits` (passt zum Archetyp/zu den Werten — mit Begründung,
   was daran gut funktioniert), `tension` (Spannung — z. B. laut, während die
   Ton-Wörter „ruhig" sagen; mit Vorschlag, was man übernimmt und was nicht),
   `off` (widerspricht der Foundation — mit Begründung). Das ist Davids
   „Verbesserungsvorschläge ODER sagen, was bereits sehr gut ist".
4. **`g.dna`** (derivation, Text-KI): der DNA-Vorschlag je Dimension aus
   BEIDEN Quellen, mit Begründung, die auf Vorbilder verweist („wie in Bild
   3, aber wärmer — eure Werte sagen Nähe, nicht Distanz"). Ohne Vorbilder
   wie bisher aus der Foundation allein.
5. **`g.boards`** / **`g.board`** / **`g.mix`** wie bisher (drei Boards,
   Wahl, Mix & Match mit Festhalten).

**Leitplanken, die man nicht „vereinfachen" darf:** (a) **Lesen, nie
nachbauen** — die Lesung ist eine DNA-Belegung, kein Abbild; Vorbilder sind
Fremdwerke (Urheber-/Markenrecht), Hinweis im UI wie bei den KI-Entwürfen.
(b) **Die Foundation ist der Maßstab** — ein Vorbild ohne Bezug zur Foundation
wird nicht „schöner gefunden", sondern eingeordnet (fits/tension/off); die
Begründung nennt immer die Foundation-Stelle (Archetyp, Wert, Ton-Wort).
(c) **Bilder sind Eingabe, keine Ausgabe** — sie erscheinen nur im Kapitel
und in Fridas Begründungen, nie im Ergebnis. (d) **Vision-Transport** =
derselbe Core-Weg wie die KI-Bilder (§2.12), ZDR-Bedingung gilt auch für das
LESEN von Bildern (Kunden-Screenshots reisen zum Anbieter); Drossel je
Marke (12 Bilder je Lauf, 3 Läufe/Tag). (e) **Herkunft am Vorschlag**: jede
DNA-Zeile sagt, ob sie aus Foundation, Vorbild oder beidem kommt.

**Frühere Fassung (2026-09-07, zur Nachlese):** Kapitel 1 kannte nur die
Foundation als Quelle:

- **Vokabulare** als pure Datei `shared/brandVisualDna.ts`: die zehn
  Dimensionen aus Davids Notiz (Visual Style, Aesthetic Era, Form Language,
  Typography, Color Character, Imagery, Composition, Materiality, Motion
  Character, Overall Mood), je 4–7 KONTROLLIERTE Werte mit Ids (i18n-Labels),
  keine Freitexte. Ein Moodboard = eine Belegung aller zehn.
- Sessions: `g.dna` (derivation, KI: Vorschlag je Dimension MIT Begründung
  aus Archetyp, Werten, Ton-Wörtern, Positionierung; die G4-Richtung ist die
  Vorbelegung — Katalog-Id ⇒ DNA-Preset, pure Tabelle) · `g.boards`
  (derivation, PURE Regel: drei Moodboards als Varianten der DNA — „so wie
  vorgeschlagen", „eine Stufe ruhiger", „eine Stufe mutiger", je mit
  Farbwelt-Skizze, Schriftpaar, Formsprache; kein KI-Aufruf) · `g.board`
  (choice: eines der drei) · `g.mix` (stage-edit: Mix & Match — je
  Dimension festhalten oder aus einem anderen Board nehmen; Regenerate nur
  für nicht festgehaltene Dimensionen — das Lock-Muster von Huemint/Fontjoy).
- Ergebnis: die bestätigte DNA, maschinenlesbar, wandert später in
  `brand.json` (Produkt 03) und ist die Vorbelegung ALLER folgenden Kapitel.

### 2.3 Kapitel `color` — Farbwelt mit Ramp und Kontrast

- Sessions: `h.base` (derivation: drei Basisfarben-Kandidaten aus DNA
  „Color Character" + Archetyp, mit Begründung; der Mensch wählt oder gibt
  einen Hex) · `h.ramp` (derivation, PUR: hell/dunkel-Ramp 50–950 über die
  Themes-Mathematik) · `h.neutral` (choice: getönte Neutral-Ramp aus der
  Basisfarbe oder kühl/warm) · `h.accent` (choice: ein Akzent aus drei
  harmonischen Kandidaten) · `h.roles` (stage-edit: Rollen Grund & Text,
  Flächen, Akzent, Signal — die Rollen-Sprache aus dem Beispiel) ·
  `h.contrast` (derivation, PUR: Kontrast-Paare Text/Grund hell und dunkel
  mit AA/AAA-Urteil; ein Vorschlag, der AA reißt, wird nicht angeboten).
- **Preset-Vertrag zur Themes-Engine (A14, explizit):** der brand-Layer
  importiert `packages/themes/shared/ramp.ts` und `oklch.ts` als PURE
  Bibliothek (kein `app/`, kein Server, kein Zustand) — der einzige erlaubte
  Cross-Layer-Import, per ESLint-Ausnahme mit Begründung eingetragen. Die
  Engine bleibt unverändert; Brand Design erzeugt nur Werte in ihrer Form
  (`ThemeConfig`-kompatibel), damit Produkt 03 daraus Tokens und die
  Platform daraus ein Community-Theme machen KÖNNEN.

### 2.4 Kapitel `type` — Typografie

- Sessions: `i.pair` (choice: kuratierte Paare — die sechs aus dem
  Themes-Konzept §3.5 plus die G4-Namen, EIN Katalog `shared/brandFontPairs.ts`
  mit Familie, Stack, Rollen; Vorschau mit ECHTEN Schriften) · `i.scale`
  (derivation, PUR: Größen-/Gewichts-Hierarchie aus DNA „Typography" und
  „Composition" — ruhig/dicht/luftig) · `i.rules` (stage-edit:
  Überschriften-Gewicht, Laufweite, Versalien, Mono-Rolle).
- **Schriften laden:** `@nuxt/fonts` self-hostet nur, was der Build im CSS
  sieht — `apps/branding` deklariert die kuratierten Familien einmal in einer
  CSS-Datei (wie `fonts.css` der themes), nichts wird zur Laufzeit von einem
  CDN geholt. Font-Upload bleibt Phase 2 (der Bucket existiert).

### 2.5 Kapitel `mark` — das Zeichen in drei Stufen (§1.11 b)

1. **Richtung + Briefing:** `j.kind` (choice: Wortmarke · Bildmarke ·
   Kombination · Monogramm, mit Begründung aus DNA „Form Language" und
   Name) · `j.brief` (stage-edit, KI-Entwurf: Charakter, Formsprache,
   Schutzraum-Regel, Varianten-Bedarf, No-Gos, Einsatzorte — das Briefing,
   das ein Designer bekommt).
2. **Gesetzte Beispiele:** `j.examples` (derivation, PUR: Wortmarke und
   Monogramm als SVG aus Schriftpaar + Farbwelt — Generator
   `shared/brandMarkSvg.ts` nach dem Muster von `themes/shared/brandMark.ts`
   und `brandCard.ts`; Varianten: primär, invertiert, einfarbig, Icon-
   Fläche; Schutzraum als gezeichneter Rahmen; KEIN KI-Aufruf) · `j.pick`
   (choice: eine Setzung als Vorzugs-Beispiel).
3. **KI-Bildlogo-Bereich:** `j.drafts` (special, Editor `drafts`): auf
   Knopfdruck erzeugt ein Bildmodell 4 Entwürfe aus Briefing + DNA +
   Farbwelt; jeder Entwurf trägt Modell, Datum, Prompt-Hash und den
   Vermerk „Entwurf — Idee für die Designer-Arbeit, kein geprüftes Logo";
   Markenrechts-Hinweis im UI. Der Mensch kann Entwürfe BEHALTEN (kept)
   oder verwerfen; behaltene stehen im Kapitel und im Briefing, reisen aber
   NICHT in Foundation-Snapshot oder Share (§1.11 b). Leitplanken: Drossel
   3 Läufe je Marke und Tag + Instanz-Deckel, Kosten als
   `generation.*`-Ereignisse, ZDR-Routing wie beim Text (§2.12).

### 2.6 Kapitel `imagery` — Bildsprache & Ikonografie (eigene Vorschau, §1.11 a)

- Sessions: `k.photo` (derivation + choice: drei Bild-Prinzipien aus DNA
  „Imagery"/„Materiality"/„Mood" — Licht, Ausschnitt, Menschen, Farbigkeit,
  mit Begründung) · `k.illustration` (choice: keine · Linie · Fläche ·
  organisch, mit Regeln) · `k.icons` (choice: Linie/Fläche, rund/kantig,
  Strichstärke — Vorschau mit einem echten Icon-Set (Phosphor-Varianten))
  · `k.dodont` (stage-edit: Do & Don't der Bildsprache in der Foundation-Form).
- **Vorschau ohne Fotos:** Stil-Karten, die die Prinzipien DARSTELLEN
  (Kontrast, Wärme, Ausschnitt als abstrahierte Kompositionen aus Farbwelt
  und Form) plus — weil David KI-Bilder zulässt — optional zwei KI-
  Beispielbilder je Prinzip aus demselben Bild-Transport, gekennzeichnet
  wie die Logo-Entwürfe und mit derselben Drossel. Keine Stock-Fotos.

### 2.7 Kapitel `motion` — Bewegung mit Charakter (eigene Vorschau)

- Sessions: `l.tempo` (choice: ruhig · lebendig · knapp, aus DNA „Motion
  Character") · `l.transitions` (derivation, PUR: Dauern 150–250 ms, Easing,
  Versatz — als Token-Satz) · `l.logo` (choice: kinetisches Zeichen ja/nein,
  mit Regel für `prefers-reduced-motion`) · `l.rules` (stage-edit: wo
  Bewegung erlaubt ist und wo nie).
- **Vorschau:** die Szene (§2.9) spielt die Übergänge live — Knopf-Hover,
  Karten-Einblendung, Seitenwechsel — mit den gewählten Tokens und
  respektiert `prefers-reduced-motion` (dann stehen die Werte als Text).

### 2.8 Das Ergebnis: Preset, Kapitel 10, Snapshot

- **`BrandDesignPreset`** (Typ in `shared/types/brand.ts`, gebaut von der
  puren Regel `buildBrandDesign(values)` aus den bestätigten Slot-Werten —
  dieselbe Wahrheit wie bei G4, kein Spiegel): `{ version, dna, color: {
  base, rampLight, rampDark, neutral, accent, roles, contrastPairs }, type: {
  pair, scale, rules }, mark: { kind, brief, examples: svg[], keptDrafts:
  refs[] }, imagery: { principles, illustration, icons, dodont }, motion: {
  tempo, transitions, logo, rules } }`.
- **Kapitel 10 der Foundation** rendert das Preset VOLL: Farbwelt als Ramp-
  Streifen hell/dunkel + Rollen, Typografie als Specimen mit echten
  Schriften, Zeichen als SVG-Setzung (behaltene KI-Entwürfe NUR privat, als
  „Entwürfe"), Bild-Prinzipien mit Do/Don't, Motion-Regeln — die Schranke
  fällt, die Kapitel-Überschrift wird „Visuelle Identität". Ohne Brand Design
  bleibt G4 (Richtung + Schranke), unverändert.
- **Snapshot** steigt auf `schemaVersion: 2`: `presetId = 'design:<profileId>'`,
  `presetVersion = <Preset-Fassung>`, dazu das Preset EINGEFROREN (ohne
  KI-Entwürfe). Der Renderer liest v1 UND v2 (§2.7 des BF1-Konzepts).
- **Produkt 03** liest dasselbe Preset für Tokens — Brand Design erzeugt die
  Werte, exportiert sie aber nicht (Nicht-Ziel).
- **Ergebnis-Board (2026-09-08):** am Ende der Schicht ein zusammengesetztes
  Board — Farbwelt, Schriftpaar, Zeichen-Setzung, Bild-Prinzipien, Bewegung
  auf EINER Fläche, druckbar, als Kopf von Kapitel 10 und als eigene Ansicht
  `/brand/:id/design` (Lesen, nicht entscheiden). Es ist das „Moodboard am
  Ende", das David für den Weg ohne Vorbilder meinte — in beiden Wegen
  dasselbe Artefakt.

### 2.9 Vorschau-Szenen (§1.11 c)

Komponente `BwDesignScene` (brand-Layer): Hero mit Wortmarke, Überschrift +
Fließtext, Knopf, Zitat, Karte, Ramp-Streifen; Props = Preset-Ausschnitt;
alles über LOKALE CSS-Variablen im Scope der Szene (kein `:root`, keine
iframes — G4 hat das Muster bewiesen), echte Schriften per `font-family` aus
dem Katalog; hell/dunkel-Umschalter je Szene; drei Szenen nebeneinander für
Vergleiche (Moodboards, Basisfarben, Paare). Dieselbe Szene ist die Vorschau
in JEDEM Kapitel — eine Komponente, sechs Zustände.

### 2.10 Freischaltung je Marke (§1.11 d)

- `brand_profiles.designUnlockedAt` (Migration brand-020, additiv, null =
  gesperrt) + `designUnlockedBy` (Betreiber-Id). Setzt der Betreiber im
  Betreiber-Dashboard der branding-App (Liste „Brandings" existiert seit
  BW2/G-Paketen — neue Spalte/Knopf „Brand Design freischalten", Capability
  `brand.manage`); Ereignis `design.unlocked`.
- Kapitel 10 der Foundation: vor der Freischaltung der heutige CTA
  (Erstgespräch + Richtung), danach „Brand Design starten" → `/brand/:id/dna`.
- KEIN Stripe, kein Preis, keine Selbstbedienung in dieser Fassung.

### 2.11 Datenmodell und Migrationen (additiv)

- brand-020: `brand_profiles.designUnlockedAt/designUnlockedBy`.
- brand-021: Tabelle `brand_mark_drafts` (profileId, stepKey, kind
  'logo'|'image', model, promptHash, fileId, kept, createdAt; permissions [],
  server-only) + Bucket `brand-drafts` (permissions [], Auslieferung NUR über
  eine Route mit `requireBrandAccess` + Besitzprüfung, `Cache-Control:
  private`).
- brand-022: Tabelle `brand_inspiration` (profileId, fileId, area, note,
  reading JSON, createdAt; permissions [], server-only) + Bucket
  `brand-inspiration` (permissions []; Ausliefer-Route mit Besitzprüfung,
  `private, no-store`).
- Registry: sechs Steps, ~27 Sessions (Kapitel 1 mit `g.source`,
  `g.inspiration`, `g.reading` — die zwei letzten `internal`) (Typ/Kind/audience/sensitivity), Frida.
  `audience`: alle Festlegungen `foundation`, Entwürfe (`j.drafts`,
  `k.photo`-KI-Bilder) `internal`.
- Journey: `includeStep` kennt die Freischaltung (Schicht 2 ohne
  `designUnlockedAt` ⇒ nicht auf dem Weg, NICHT „gesperrt" — sonst zählten
  die Kapitel im Fortschritt mit).

### 2.12 KI, Kosten, Drosseln

- Text (DNA, Briefing, Bild-Prinzipien): derselbe Transport
  (`advisorGenerator`, ZDR-Routing, Eimer wie der Wizard).
- **Bilder LESEN — NEU im Core:** `aiVision(event, images, prompt, options)`
  (dieselbe Familie, Bild-Eingabe an ein multimodales Modell, Antwort als
  JSON über `aiCompleteJson`-Regeln), Modell aus `pukalani.ai.visionModel`
  (Core-Default aus), ZDR-Routing wie Text. Konsument: `g.reading`.
- **Bilder ERZEUGEN — NEU im Core:** `aiImage(event, prompt, options)` in
  `core/server/utils/aiComplete.ts`-Familie (eigener Commit): OpenAI-
  kompatibler `images/generations`-Weg über denselben Schlüssel, Modell aus
  `pukalani.ai.imageModel` (Core-Default aus), `providerRouting` mit
  denselben Datenschutz-Bedingungen wie der Text (§2.19 Frage 1: welcher
  Anbieter erfüllt ZDR für Bilder), Antwort = Bytes, die der brand-Layer in
  den Bucket legt. Drossel `imageDay`: 3 Läufe je Marke und Tag, 4 Bilder je
  Lauf, Instanz-Deckel 40 Läufe/Tag; jeder Lauf ein `generation.*`-Ereignis
  mit Modell, Dauer, Bildzahl — nie Prompt, nie Bild.

### 2.13 Sicherheit

- Vorbilder liegen server-only im Bucket `brand-inspiration`, nur der
  Besitzer bekommt sie ausgeliefert; sie reisen nie in Snapshot, Share,
  Beispiel, Dokument oder Prompt-Logs; Fremdwerk-Hinweis im UI.
- Entwürfe liegen server-only; die Ausliefer-Route prüft Besitz und setzt
  `private, no-store`; kein Bild reist in Snapshot, Share oder Beispiel.
- Prompts an das Bildmodell enthalten Foundation-Werte (wie der Text-Weg),
  nie Rohantworten mit `sensitivity: internal`.
- SVG-Setzungen werden aus Katalogwerten gebaut (kein Nutzer-SVG, kein
  Upload) — Sanitizer wie beim Markdown bleibt für Texte.
- Freischaltung ist eine Betreiber-Handlung mit Ereignis, nicht vom Client
  setzbar.

### 2.14 Messung

`design.unlocked`, `step.completed (mit `stepKey` eines Design-Kapitels — kein eigener Typ, Davids Entscheidung 2026-09-09)` (stepKey, Sekunden),
`design.image.generated` (kind, count, model, ms), Korrekturrate je
DNA-Dimension (wie oft „festhalten" vs. neu), Anteil behaltener Entwürfe,
Zeit von Freischaltung bis Kapitel 10 voll. Alles im Funnel (`brand_events`).

### 2.15 Prototyp (Phase 3, nach Freigabe) — ein Screen je Interaktionstyp

Im Playground mit Kailua: (1) drei Moodboards nebeneinander + Mix & Match;
(2) Farbwelt: Basisfarbe wählen, Ramp hell/dunkel in der Szene,
Kontrast-Matrix; (3) Typografie: Paar-Karten mit echten Schriften +
Specimen; (4) Zeichen: Richtung → Briefing → SVG-Setzungen → KI-Entwürfe mit
Kennzeichnung; (5) Bildsprache: Stil-Karten + Do/Don't; (6) Motion: Szene mit
Live-Übergängen + reduced-motion-Zustand; (7) Kapitel 10 voll; (8) Rail mit
gesperrter/offener Schicht 2 und Betreiber-Freischaltung.

### 2.16 Nicht-Ziele (diese Fassung)

Tokens-Export, brand.json, Figma (Produkt 03) · DAM, Vorlagen, Website
(03/04) · Umbau der Themes-Engine · Font-Upload · Rechtsprüfung von Zeichen
· Stripe/Preis · Extraktion des Ist-Zustands bestehender Websites (H6 — eigener
Baustein, Relaunch-Einstieg, nach dieser Fassung).

### 2.17 Abhängigkeiten und Fallen

- **Schriften nur per Build:** neue Familien müssen im CSS der App stehen,
  sonst fällt die Vorschau auf den Stack zurück (G4-Muster); der Katalog
  nennt deshalb nur, was deklariert ist — Test, der beide abgleicht.
- **A14-Import** aus `themes/shared` braucht die ESLint-Ausnahme MIT
  Begründung; alles andere aus themes bleibt tabu.
- **Bild-Transport ist Core** (eigener Commit, Core-Default aus, Config-
  Gate) — ohne Anbieter mit ZDR bleibt Stufe 3 abgeschaltet, das Kapitel
  funktioniert trotzdem (Stufe 1+2 sind pur).
- **Migrationen vor Deploy** (brand-020/021), Bucket-Anlage im Migrations-
  Skript; Schema-Parität eintragen.
- **Zeit (H5):** das Moodboard belegt alle Kapitel vor — jede Session muss
  als BESTÄTIGUNG durchlaufbar sein; die Beta misst die Dauer je Kapitel.

### 2.18 Pakete (VERBINDLICH seit Prototyp-Freigabe 2026-09-08)

**Stand:** D0 GEBAUT und geprüft 2026-09-08 (Opus-Agent, Fable-Prüfung;
Commits 18d95a37 + Klemme). Gelernt: (1) die Registry-Erweiterung sickert in
vier LESER (Rail, Dokument, Leseansicht, Fortschritts-Cache) und in den
Impact-Hinweis „fließt in N Felder ein" — alle fünf sind bis D1/D8 auf die
Foundation geklemmt, der Hinweis über die pure Regel `affectsView` (nur
erreichbare Kapitel); der Klick-Beweis auf der echten Dokument-Seite fand
den fünften, die 2 299 Unit-Tests nicht. (2) Migrations-Nummern: brand-020
und 021 sind inzwischen vergeben (Publications, Discover) — Freischaltung
= **brand-022**, KI-Entwürfe = **brand-023**, Vorbilder = **brand-024**
(§2.10/§2.11 nennen noch die alten Nummern; die Dateinamen entscheiden).
(3) Der Worktree hat nur eine Teil-Installation: `nuxi typecheck` meldet
dort ~13 000 Auto-Import-Fehler über alle Layer (vorbestehend, 0 in
`packages/brand/shared`); Beweis lief per `tsc --strict` über die neuen
Dateien und in der CI. (4) `/brand/:id/dna` zeigt Bestandsmarken die
Sperr-Fläche mit dem Satz „Schließ das Kapitel davor ab" — D1 gibt
`design_locked` seinen eigenen Satz. (5) `j.pick` steht im Konzept, nicht
im Prototyp — angelegt nach Konzept; D5 entscheidet, ob es bleibt.

**Stand D1:** GEBAUT und geprüft 2026-09-08 (Opus-Agent, Fable-Prüfung; vier
Commits ab 47efafa4) — Migration **brand-022** (`designUnlockedAt`,
`designUnlockedBy`, kein Index), Betreiber-Routen `POST /api/brand/admin/
profiles/:id/design-unlock|design-lock` + Liste `GET …/design-unlocks`,
Betreiber-Seite `/dashboard/brand-design` (UTable, Bestätigung, Chip „Frei
seit …"), Ereignisse `design.unlocked`/`design.locked`, echter Rail-Layer
„Brand Design" (gesperrt mit Info-Layer, freigeschaltet sechs Kapitel + eigener
Stand „x von 6"), eigener Sperrsatz auf `/brand/:id/dna`, Kapitel 10 zeigt
nach Freischaltung „Brand Design starten". Beweis 139/139 (Abschnitt 21:
Freischaltung, Rücknahme, Gegenprobe ohne fertige Foundation, 401/403 fremd).
Abweichungen vom Konzept, entschieden im Bau: (a) Capability **`users.manage`**
statt `brand.manage` — die gibt es im RBAC nicht, und `users.manage` ist die
Betreiber-Klammer dieses Layers (Warteliste, Ranking, Discover); (b) es gab
KEINE Betreiber-Liste „Brandings" (`/dashboard/brands` ist Kundenfläche) ⇒
eigene Seite; (c) fremdes Konto an der Admin-Route antwortet 401/403 wie jede
Nachbar-Betreiberroute, nicht 404; (d) die Freischaltung LEGT die sechs
`brand_steps`-Zeilen an (Bestandsmarken haben neun) — sonst 404 auf `dna`;
(e) Design zählt NICHT in „Schritt x von 9"/Marken-Karte (Foundation), der
eigene Stand steht am Layer. Deploy-Reihenfolge: **Migration VOR Code** —
`profiles/index.post.ts` nennt die Spalten explizit. Frida spricht noch nicht
(Werkstatt liest `BRAND_VOICE`; Wechsel mit D2); Leseansicht/Dokument haben
weiter einlagige Rails (D8).

**Stand D2a (Weiche + Vorbilder-Upload):** GEBAUT und geprüft 2026-09-08
(vier Commits, Core-Drossel `brand:inspiration` 12/min als eigener Commit) —
Migration **brand-024** (Tabelle `brand_inspiration`: Zeilen-Id = Datei-Id,
`area` varchar aus dem Vokabular, `filename`, `note`, `number`, `reading` für
D2b; Bucket `brand-inspiration` permissions [], 5 MB, png/jpg/webp), Routen
`GET/POST /api/brand/profiles/:id/inspiration`, `PATCH/DELETE …/:fileId`,
`GET …/:fileId/image` (nur Besitzer, `private, no-store`), Magic-Bytes
(WebP = RIFF + WEBP), 12 je Marke, GDPR-Export/Löschung, Ereignisse
`design.inspiration.added|removed`; Weiche `g.source` als Karten, Instrument
`uploads` (`BwUploadsEditor`), Frida als Stimme der Design-Kapitel. Beweis
170/170 (Abschnitt 22: Formate, Gegenproben 400/413/409, fremd 404, Share
ohne Vorbilder, Löschen ⇒ Bucket 404). Entschieden im Bau: (a) kein
`fileId`/`createdAt` — Zeilen-Id und `$createdAt` sind die Wahrheit; (b) der
Slot `g.inspiration` wird NIE `confirmed` (härtere Fassung von Leitplanke c:
`confirmedSlotValues` trüge ihn sonst ab D8 ins Dokument); (c) „Frida schlägt
vor" ist Anzeige (Instrument weg, Entfällt-Satz), kein neuer Session-Zustand
(§2.1); (d) Bereichs-Vorgabe beim Ablegen = Farbwelt, an der Karte änderbar.
Deploy-Reihenfolge: **Migration VOR Code** (Upload sonst 503). Inhalts-Gate
David: Karten-Texte der Weiche, Präfix „Bekannt:" vor der Beispielzeile
(geteilt mit den Architektur-Modellen — liest sich bei „Frida schlägt vor"
schief), Privatheits-/Fremdwerk-Satz.

**Stand D2b (Lesung gegen die Foundation):** GEBAUT und geprüft 2026-09-08
(Core `aiVision` als eigener Commit — Transport neben `aiComplete`, Gate
`pukalani.ai.visionModel` leer = aus, Laufzeit-Override `app_config.
aiVisionModel`, **ZDR fest im Transport**: `provider.data_collection = 'deny'`
wird immer gesetzt und lässt sich nur verschärfen; Bilder nie im Log). Brand:
`POST …/inspiration/read` (Besitzer, Kapitel offen, 503 `vision_unavailable`
ohne Modell, 429 mit Retry-After), Prompt aus den vier Foundation-Feldern +
DNA-Vokabular (nur Ids), Klemmung in `shared/brandReading.ts`, je Bild
`reading` in der Tabelle, Fazit + Lauf-Metadaten als Slot-Wert `g.reading`
(intern, reist nie), Drossel 3 Läufe/Tag je Marke + IP-Eimer `brand:reading`,
Stub `BRAND_DEV_STUB_VISION=1`, UI `BwReadingPanel`. Beweis 189/189
(Abschnitt 23). **Regel-Änderung mit Foundation-Wirkung (Prüf-Befund):**
`resolveSessionStates` reicht ein nicht bestätigbares Instrument (`special`)
an seine Quellen durch statt auf sein `confirmed` zu warten — nötig, weil
`g.reading` an `g.inspiration` hängt und sonst nie abnehmbar wäre. Dieselbe
Regel trifft `d.pairs` → `d.primary`/`d.secondary` im Archetyp-Kapitel:
die standen unter der alten Regel FÜR IMMER auf `locked` (Vergleichslauf
alt/neu: „nur d.hypothesis bestätigt ⇒ d.primary locked → open") — die
Abschluss-Formel hatte das für die Abnahme schon 2026-09 (Audit A4)
korrigiert, die Session-Zustände nicht; jetzt sind beide konsistent.
Modellwahl für Prod ist Davids Entscheidung (Vorschlag des Baus:
`google/gemini-2.5-flash`, ~20 000 Tokens je Lauf, Cent-Bereich); bis dahin
antwortet Prod ruhig 503, das Kapitel läuft ohne Lesung. Offen für D2c:
`g.dna` hängt an `g.reading`; auf dem Weg „Frida schlägt vor" muss der
Vorschlag ohne Lesung entstehen.

**Stand D2c (DNA, Boards, Mix & Match, Szene):** GEBAUT und geprüft
2026-09-08 (Opus-Agent, Fable-Prüfung; Commits ab cd913e85 + drei Klemmen).
Pure Regeln in `shared/brandDesignDna.ts` (Klemmung: nur Vokabular-Ids,
Begründung Pflicht, `inspiration` ⇒ `both`, ohne Vorbilder alles
`foundation`; Boards als deterministische Achsen-Rechnung; Mix & Match;
`brandDesignDefaultsFromDna` = H5-Vorbelegung), Weg ohne Vorbilder über
`conditionalInputCounts` (`g.reading` zählt nur bei `g.source =
inspiration`), Route `POST …/dna/propose` (10/Tag), Szene `BwDesignScene` +
`brand-fonts.css` (sieben Familien self-gehostet, Build bewiesen), Panels
`BwDnaPanel`/`BwBoardCard`/`BwDnaMixPanel`. Beweis 213/213 (Abschnitt 24),
2 450 Tests. **Drei Klemmen aus dem eigenen Klick:** (1)
`resolveNextSession` fragt nur ERREICHBARE Sessions — nach dem Karten-Klick
auf die Weiche sprang das Gespräch zur gesperrten Board-Wahl, der
Bestätigen-Knopf der Weiche kam nie (Stillstand des Kapitels); (2) die
DNA-Route prüfte die Text-KI über `isAiConfigured` (Core-Gate
`pukalani.ai.enabled`, das branding nie setzt) und hätte auf Prod IMMER 503
geantwortet — jetzt wie die Foundation-Generatoren nur der Schlüssel;
(3) die Prompts nennen ein Bild im deutschen Satz „Vorbild N" (das Modell
schrieb „wie in reference 1"). **Echter Lauf (gemini-2.5-flash + Text-
Modell, lokal mit Prod-Schlüssel):** zwei Test-Bilder — gedämpftes Braun ⇒
`color=earthy`, „Trägt schon", Anker „Warm & Editorial"; Neongrün ⇒
`vivid`, „Passt nicht" mit Vorschlag; DNA: zehn Zeilen, alle Vokabular-Ids,
neun `foundation`, eine `both` mit Vorbild-Bezug. Nebenbefunde (Inhalts-
Gate/D-Folgepakete): Entwurfs-Knopf heißt in Design-Kapiteln „George,
entwirf das" (generischer i18n-Text, gehört Frida); nach dem Karten-Klick
gilt eine Wahl als „gefüllt" und wird erst am Kapitelende bestätigt —
Foundation-Muster, in `dna` nun sauber; Board-Karten im Auswahl-Modul
schmal; `g.boards` wird ohne sichtbare Boards bestätigt (Karten im
Folge-Schritt).

**Stand D3 (Farbwelt):** GEBAUT und geprüft 2026-09-08 (Commits a8f42a97,
eacdf464, 363c51a8). Pure Regeln in `shared/brandDesignColor.ts`: Basis-
und Akzent-Kandidaten deterministisch aus `result.direction` + Kachel-
Farbwelt (kein KI-Lauf), AA-Gate der Basisfarbe gegen ihren eigenen
Papierton, Akzent-Abstand als normierter Kanal-Abstand (0,06 — der
naheliegende „Kontrast zur Basis" ist falsch: Kontrast misst Helligkeit,
zwei tiefe Töne verschiedener Farbe haben fast keinen), fünf Rollen (Grund
& Text = Rampe 900, Wärme & Flächen = Rampe 100, Helle Flächen =
Grundton 100, Akzent & Signal, Papier & Ruhe = Grundton 50 — abweichend vom
Prototyp, weil zwei Rollen nie dieselbe Quelle haben dürfen), Kontrast-
Matrix (fünf Pflicht-Paare mind. AA, `accent-dark` nur Auskunft; sonst
bleibt `h.contrast` leer statt eines ausgegrauten Knopfs). Bühne
`BwColorPanel` + `useBrandColorWorld`: sechs Abschnitte, Hex-Feld UND
`UColorPicker` im `UPopover` als ein Wert mit zwei Griffen, Hell/Dunkel als
zwei feste Szenen mit Urteil je Welt. Beweis 232/232 (Abschnitt 25), 2 483
Tests; eigener Klick: Hex `#b98a5e` und Picker `#311b07` rechnen Rampen,
Rollen, Paare und beide Szenen live um (14,5 → 15,1 → 15,7:1), 0 Fehler.
Zwei Klemmen mit D2c-Wirkung: `BRAND_STAGE_SOURCE_SLOTS` kannte `dna` nicht
(die Boards fielen für JEDE Marke auf `warm-editorial` zurück — jetzt
`dna: [result.direction]`, `color: [g.mix, result.direction]`); `watch(…,
{ immediate })` mit `import.meta.client` läuft vor dem ersten Rendern ⇒
drei Hydration-Mismatches, Kur `onMounted` (auch für `g.boards`/`g.mix`).
Offen: Knopf-Paar `button-light` misst Papier auf Akzent, die Szene rechnet
die Schriftfarbe adaptiv (bei hellem Akzent sagt die Tabelle „fällt durch",
die Szene zeigt lesbaren dunklen Text) — D8 oder eigene Entscheidung; der
zweite Basis-Kandidat aus der Kachel-Farbwelt ist produktseitig dünn.
Inhalts-Gate: Rollen-Namen/-Quellen, Kandidaten-Begründungen, Absage-Satz
der Kontrast-Regel, Frida-Leitern `h.*`.

**Stand D4 (Typografie):** GEBAUT und geprüft 2026-09-08 (Commits a2a30c15,
b2927d44, d8441b3d, fe3c1b43). Pure Regeln `shared/brandDesignType.ts`
(Vorbelegung Paar + Hierarchie aus der DNA, Hierarchie als EIN Faktor
ruhig 1 · dicht 0,85 · plakativ 1,25, Regeln Gewicht 300–700, Laufweite
−1…+1 px, Versalien, „nie mehr als drei Schriften" als Rechnung), Bühne
`BwTypePanel` + `useBrandTypeWorld` (Paar-Karten mit echten Schriften,
Specimen, Szene in der bestätigten Farbwelt), Registry `i.pair`/`i.rules`
ohne Entwurfs-Generator (Katalog-Id, keine Prosa), neue Invariante `oneOf`.
**`brand-fonts.css` ist jetzt die Quelle des Katalog-Tests** (Familien UND
Schnitte). Fund am Klick: `@nuxt/fonts` beschafft nur `400 700` — Schnitt 300
war nie geladen, der Browser hätte ihn selbst gemalt; Kur
`fonts.defaults.weights = [300,400,500,600,700]` im Layer (ein Bereich
`'300 700'` endet bei 400). Beweis 249/249 (Abschnitt 26), 2 518 Tests;
eigener Klick, gemessen per `getComputedStyle`: Paar Klassisch → Geometrisch
schaltet alle Überschriften von PT Serif auf Sora, Gewicht 600 und
Hierarchie Plakativ (52/42 px) greifen, `document.fonts` hält Schnitt 300
für fünf Familien. Abweichung: ungültige Paar-Id ⇒ 409 `invariant_violated`
(Layer-Antwort für Formverstöße), nicht 400. Nebenbefund behoben: der
Doku-Renderer kannte `hex` nicht (leere Invarianten-Zeile seit D3).
Inhalts-Gate: Paar-Namen/Notizen, `brand.type.*`-Texte, Grenzen (Laufweite
±1 px statt +4 im Prototyp), Frida-Leiter `i.pair`, Mono-Specimen-Zeile.

**Stand D5a + D5b (Zeichen: Richtung, Briefing, Setzungen):** GEBAUT und
geprüft 2026-09-08 (Commits 8a21a7bd, d947c992, a9b235ab, 5493a72a). Pure
Regeln `shared/brandDesignMark.ts` (Richtungs-Vorbelegung aus der DNA,
Briefing-Form mit Klemmung: vier geschriebene + zwei GERECHNETE Felder —
Schutzraum = Versalhöhe, Mindestbreite 96 px digital / 24 mm Druck,
Monogramm ≥ 24 px; Eckenradius aus DNA `form` weich 34 % / kantig 0),
`shared/brandMarkSvg.ts` (deterministischer SVG-Satz Wortmarke + Monogramm
in vier Varianten, Schutzraum gezeichnet, Name XML-escaped), Briefing-Lauf
`POST …/mark/brief` (Text-KI, Gate = Kill-Switch + Schlüssel, Stub
`BRAND_DEV_STUB_MARK=1`, 10/Tag), Bühne `BwMarkPanel` (vier Richtungs-
Karten nebeneinander, Briefing-Blöcke, Setzungen live aus Paar + Farbwelt,
Stufe 3 als Platzhalter „KI-Entwürfe folgen (D5c)"). Beweis 274/274
(Abschnitt 27), 2 551 Tests; eigener Klick, gemessen an SVG-Attributen:
Source Serif 4, Tinte `#352217` auf Papier `#fcfaf9`, „Invertiert" dreht
beide, Richtungswechsel schreibt `j.kind`, Briefing kommt in Blöcken, 0
verschachtelte Buttons. Zwei Funde des Agenten behoben: der Lauf las `j.kind`
nur bestätigt (Briefing für die falsche Richtung); Ersatztext zeigte die Id.
Offen: `j.pick` folgt der Richtung nur, solange der Slot leer ist; Szene
bekommt den Namen als Prop, kein SVG im Kopf (D8). Inhalts-Gate: die vier
Richtungs-Begründungen (Entwurf des Baus), die Maße als Setzung, der Satz
„gesetzte Beispiele, kein Logo", Frida-Leitern `j.*`. **D5c braucht:** Core
`aiImage` (ZDR fest), Migration **brand-023** (`brand_mark_drafts` +
Bucket `brand-drafts`), Davids Bild-Modell (Vorschlag des Baus:
`google/gemini-2.5-flash-image-preview`, ~3–5 ct je Bild, ≈ 0,40–0,60 €
je Marke und Tag im Vollausschlag — VORHER prüfen, ob es unter
`data_collection: deny` geroutet wird). **Entschieden (David, 2026-09-08):**
Bild-Modell `google/gemini-2.5-flash-image-preview`, Migration brand-023
darf nach der Prüfung von D5c gefahren werden.

**Stand D6 (Bildsprache & Ikonografie):** GEBAUT und geprüft 2026-09-08
(Commits 0204de2b, 1f9611e5, 88688d31). Pure Regeln
`shared/brandDesignImagery.ts`: drei Prinzipien mit vier Achsen als
Do/Don't-PAAR (das Do ist der Kartentext — eine Fassung, nicht zwei),
Vorbelegung aus DNA `imagery` (Rückfall `daylight`), Illustration/Icons
über die EINE D0-Tabelle (`materiality` wird NICHT gelesen — Abweichung
vom Auftrag, damit Produkt 03 keine zweite Zuordnung sieht), Strichstärken-
Regel gegen das Schriftpaar (Serif 1,25–1,5 px, Grotesk 1,5–2 px; Phosphor
`regular` 1,5 / `bold` 2,25 / `fill` Fläche — `bold` bekommt bei jedem
Katalog-Paar den Hinweis, Auskunft, keine Sperre), alle vier `k.*` ohne
Generator (reine Ableitung, KEINE Fotos, KEIN Bild-Modell). Bühne
`BwImageryPanel` (Prinzip-Karten mit abstrahierten SVG-Kompositionen aus der
Farbwelt, Illustration in einer Reihe, Icons darunter mit Strichstärke-
Probe, Do & Don't). Beweis 295/295 (Abschnitt 28), 2 580 Tests; eigener
Klick: Icon „Kräftig" misst `stroke-width` 2,25 px, Regeltext springt auf
„Kräftiger als eure Schrift", 0 Bilder, 0 verschachtelte Buttons. Drei
Funde des Agenten behoben: Prinzip-Karte schickte die Id statt der Blöcke
(Wahl fiel still zurück); Icons in Marken-Tinte auf dunklem Grund
unsichtbar; `g.mix` stand im Beweis als Platzhalter. Inhalts-Gate:
Prinzip-Namen/Achsen-Texte (Don't-Hälften sind Entwurf des Baus), Do &
Don't-Wortlaut, Strichstärke-Regel (ggf. vierte Option `light` 1,125 px).

**Stand D5c (Zeichen, Stufe 3: KI-Entwürfe):** GEBAUT und geprüft 2026-09-08
(Core b900208e `aiImage`; brand d38b5748 Migration brand-023 + Speicher +
Routen, 3496db4d Bühne `BwDraftsPanel`, 20b5ac32 Beweis; branding-Config
mit dem Bild-Modell). Transport: Chat-Completions mit `modalities:
['image','text']`, Antwort `choices[].message.images[]` als Data-URL —
zwingend der Chat-Weg, weil das Routing-Objekt des `/images`-Endpunkts KEIN
`data_collection` kennt (Doku-Beleg im Kopf von `aiImage.ts`); ZDR fest,
Klemmung PNG/JPEG/WebP ≤ 2 MB, max 4; Gate `pukalani.ai.imageModel`.
Tabelle `brand_mark_drafts` (Zeilen-Id = Datei-Id, model/promptHash/kept/
title), Bucket `brand-drafts` (2 MB, server-only), Auslieferung nur an den
Besitzer `private, no-store`, Drossel 3 Läufe/Tag + IP-Eimer `brand:drafts`
(getrennt von `brand:drafts-edit`), Slot `j.drafts` nie `confirmed`, GDPR
Export/Löschung, Snapshot/Dokument ohne Entwurf (Gegenprobe). Beweis
326/326 (Abschnitt 29 mit Stub) und 301/301 (503-Zweig), 2 592 + 1 482
Tests. **Echter Lauf (lokal, Prod-Schlüssel):** der Preview-Slug
`google/gemini-2.5-flash-image-preview` hat bei OpenRouter KEINE Endpunkte
mehr („No endpoints found") — umgestellt auf das freigegebene
Nachfolgemodell **`google/gemini-2.5-flash-image`** (vier Google-Endpunkte,
~0,03 ct je Bild); unter `data_collection: deny` + `zdr` + ohne Fallback
lieferte der Lauf vier PNG 1024×1024 (Roast auf Papier, Serif-Wortmarke,
Monogramm-Ansatz, Siegel), Besitzer 200 `no-store`, anonym 404. brand-023
auf Prod gefahren (Tabelle, sechs Spalten, Index, Bucket). Inhalts-Gate:
Disclaimer und Markenrechts-Hinweis (wörtlich Prototyp), Privatheits-Zusage,
Karten-/Knopf-Texte, der Bild-Prompt samt vier Blickwinkeln (Entwurf des
Baus). Offen: Preset-Anschluss `keptDrafts` (D8); Karten-Disclaimer nicht
im SSR (Karten laden nach `onMounted`).

**Stand D7 (Bewegung):** GEBAUT und geprüft 2026-09-09 (Commits b3e72002,
b19ece83, a7179568) — das letzte der sechs Werkstatt-Kapitel. Pure Regeln
`shared/brandDesignMotion.ts` (Tempo-Vorbelegung aus DNA `motion`, Tokens
`motion.fast/base/slow` als Faktor 0,5/1/1,6 der Grunddauer + Stagger 60 ms,
Übergangs-Liste mit Kurve je Zeile — auch in der Versatz-Zeile, weil Slot-
Wert und Preset dieselbe Tabelle sind; kinetisches Zeichen mit ZWEI
Optionen ja/nein (Konzept §2.7, D0-Vokabular, Prototyp — nicht drei wie im
Auftrag), sechs Regeln inkl. Dauer-Deckel „nichts länger als motion.slow"
und dem nicht abwählbaren `reduced-motion`-Satz), alle `l.*` ohne
Generator. Bühne `BwMotionPanel` (drei Tempos als drei Szenen mit
`playKey`, Token-Tabelle, Übergänge, kinetisches Zeichen mit Wortmarken-
Probe, Regeln, Schalter „Weniger Bewegung simulieren"). Beweis 352/352
(Abschnitt 30), 2 615 Tests; eigener Klick, gemessen an `--ds-dur`/
`--ds-ease` der Szene: Ruhig 240 ms → Knapp 120 ms (cubic-bezier .4/0/.2/1)
→ Lebendig 180 ms (.34/1.4/.64/1), Tokens 60/120/192 bzw. 90/180/288,
Schalter ⇒ Text-Zustand „Werte: 240 ms · …", 0 verschachtelte Buttons.
Nach Abnahme zeigt der Rail „6 von 6 Kapiteln", der Ergebnis-Punkt wird
frei (zeigt bis D8 auf `foundation#visuell`). Inhalts-Gate: Tempo-Namen
(Ruhig · Lebendig · Knapp) und Karten-Texte, Übergangs-Zwecke, die sechs
Regel-Sätze, Setzung 800 ms für den Zeichen-Aufbau. Bestandsmuster: rohe
Katalog-Ids („snappy", „yes") als Antworttext im Gespräch — D8 braucht
dafür eine Lesefassung im Dokument.

**Stand D8 (Kapitel 10 voll, Ergebnis-Board, Snapshot v2, Beispiel):**
GEBAUT und geprüft 2026-09-09 (Commits b53944a3, bea1b1ef, 8b9897b3,
b1cebaf2, a6ba1602). Preset aus der Wahrheit: `shared/brandDesignValues.ts`
(Rückwege der sechs Kapitel ⇒ `buildBrandDesign`; die acht SVG-Setzungen
werden GERECHNET, nicht aus `j.examples` gelesen; `BRAND_DESIGN_PRESET_SLOTS`
= 17 Slots), `server/utils/brandDesignPreset.ts` (`null`, solange ein
Kapitel nicht abgenommen; `keptDrafts` nur im privaten Preset, nie im
Snapshot). Kapitel 10 = EIN Block-Typ `design` in `buildBrandFoundation`
(verdrängt Schranke UND Richtung, Entwürfe nur als Zahl), Bausteine
`BwDesignChapterBody` + `BwDesignBoard` (Port des Prototyps, Druck-CSS),
Seite `/brand/:id/design` + Route `design.get.ts` (Sperr-Fläche „x von 6"
ohne Preset), eine TOC-Regel `useBrandFoundationToc` mit fünf Unterankern
(`visuell-farbwelt` …), Rail-Ergebnispunkt zeigt auf `/design`. Snapshot v2:
`schemaVersion: 2` immer, `design`/`presetId`/`presetVersion` nur mit
fertiger Schicht; Renderer fragt nach dem FELD (v1 lesbar); nur der Share-
Link reicht das Preset durch, Discover-Veröffentlichung bewusst nicht
(dauerhaft/indexierbar = eigene Entscheidung). Beispiel:
`shared/examples/kailuaCoffeeDesign.ts` gerechnet aus `buildBrandDesign`.
Nachzügler: acht Auswahl-Verträge für die Schicht-2-Ids (Lesefassung statt
`snappy`/`yes`/`word` in Gespräch, Log-Karte, Dokument), „Frida, entwirf
das" über `voice.name`, `isBrandMarkSvg` als Riegel vor `v-html`. Beweis
381/381 (Abschnitt 31) + Share 47/47 mit fallender Gegenprobe 36/47,
2 646 Tests; eigener Klick auf `/beispiel/kailua-coffee`: Kapitel 10 mit
fünf Ankern, 13 SVGs, Token-Tabelle, kein Entwurfs-Hinweis (öffentlich),
0 verschachtelte Buttons, 0 Fehler. Bewusst nicht: die sechs Design-Kapitel
stehen NICHT als Abnahme-Karten in „Euer Branding" (Werte sind Ids/Hex/
Tabellen — sie erscheinen als EIN Lese-Abschnitt); persistierte Chat-
Historie zeigt bei Karten-Klicks weiter die rohe Id (Read-Path-Tausch =
eigener kleiner Schnitt); `button-light`-Paar offen. Offene Frage: der
Snapshot trägt die Design-Werte doppelt (Preset + rohe Slot-Werte in
`chapters`, Registry-`shareable`) — gerendert wird nichts davon; ob die
sechs Kapitel aus `chapters` fallen, sobald ein Preset dabei ist,
entscheidet D9/David. Inhalts-Gate: Reihenfolge und Erklärsatz von Kapitel
10, Board-Seite (Kopfzeile, rechte Spalte, Sperr-Fläche), Entwurfs-Hinweis,
Beispiel-Briefing (Entwurf des Baus), acht Rückfragen der Auswahl-Verträge.

**Stand D9 (Gesamtbeweis):** GEBAUT und geprüft 2026-09-09 (Commits
20e1a646, eba0188f, 45fbe367, 1dd8c405). `packages/brand/scripts/
verify-brand-design.mjs` (`pnpm --filter @pukalani/brand verify:design`) —
EIN Produkt-Beweis über die ganze Schicht, 117 Zusagen in ~90 s: Sperre vor
der Freischaltung (sechs Routen 404, Board 200 „0 von 6"), Betreiber-
Freischaltung mit 401/403/409 + Ereignis, BEIDE Wege der Weiche in zwei
Marken, sechs Kapitel mit Vorbelegung aus dem Vorgänger (H5), Preset mit
sechs Teilen, Kapitel 10 + Board (Besitzer 200 / fremd 404), Snapshot v2
ohne Vorbild/Lesung/Entwurf/Prompt-Hash (Gegenprobe `VERIFY_EXPECT_LEAK=1`
⇒ 107/117), Rücknahme ohne Datenverlust, vier Deckel (429/429/429/409),
Funnel ohne Inhalte, GDPR (Export = Metadaten, Löschung räumt beide
Buckets). Dazu Sessions-Beweis 383/383, Share 47/47 (Gegenprobe 36/47),
2 651 Tests. Zwei Härtungen: (a) das Knopf-Paar `button-light` misst
dieselbe adaptive Schriftfarbe wie die Szene (`brandAccentInk`: Papier ODER
Rampe 950 auf Akzent, je nach höherem Kontrast) — PRODUKT-WIRKUNG: helle
Akzente bestehen jetzt, durch fällt der Mittelton (411 Katalog-Töne fallen
weiter); (b) der persistierte Verlauf liefert bei Karten-Klicks die
Lesefassung statt der rohen Id (`swapBrandChoiceValueLine` im Lese-Pfad,
idempotent). Nicht angefasst: der eingefrorene Prototyp `demoDesign.ts`.
**Alle Pakete D0–D9 sind gebaut; es folgen Audit (Sicherheit: Datentür,
Buckets, ZDR; Leitplanken a–e; Nicht-Ziele §2.16; die zwei Härtungen) und
Davids Abnahme mit den Inhalts-Gates aus D1–D8.** Offene Fragen an David:
(1) Kontrast-Regel — darf ein heller Akzent mit dunkler Schrift bestehen,
oder trägt ein Marken-Knopf immer hellen Text? (2) Design-Werte doppelt im
Snapshot (Preset + rohe Slot-Werte)? (3) Klickdummy mitziehen oder
einfrieren? (4) §2.14 nennt `step.completed (mit `stepKey` eines Design-Kapitels — kein eigener Typ, Davids Entscheidung 2026-09-09)`, gebaut ist der
generische `step.completed` mit `stepKey` — Konzept nachziehen?
**Entschieden 2026-09-09 (David, DECISION-LOG):** (1) adaptive Knopf-
Schriftfarbe bleibt; (2) Snapshot ohne rohe Design-Werte — gebaut als
NACHSCHNITT (Commit 2e0321b7) in der schärferen Fassung: Design-Kapitel
reisen NIE roh (`isBrandChapterShareable` in `brandSharing.ts`, Schreibweg
UND Lesepfad des Share-Links), auch nicht in die Discover-Veröffentlichung
(die kein Preset trägt) und nicht bei halbfertiger Schicht; v1-Links
unverändert. Beweise: Share 51/51 (Gegenprobe 36/51), Design 130/130
(Gegenprobe 108/130), Sessions 383/383, 2 664 Tests. (3) Prototyp
eingefroren; (4) Ereignis bleibt `step.completed` mit `stepKey`.

**Audit + A1 (2026-09-09):** Audit der Schicht ohne hohe Befunde
(docs/archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md). Paket A1 GEBAUT und
geprüft (Core a3d83495: IP-Eimer `brand:brief`, Vision-Eingangsklemme
`AI_VISION_MAX_IMAGES` 16 / `AI_VISION_MAX_BYTES` 64 MB vor jedem Netzaufruf,
Gate = Aufruf über die effektive Config, Anbieter-Fehler nur als
`code`/`type` im Log, Tests für den Laufzeit-Override; brand f22c7b0b:
GDPR-Purges werfen bei Nicht-404 (`strictFile`, Klick bleibt fail-soft),
Burst-Deckel `retainBrandGeneration` in Lesung/DNA/Briefing/Entwürfe,
Archetyp-Test für die D2b-Wirkung, Kommentar am Karten-Button). Beweise
danach: Design 130/130, Share 51/51, Sessions 383/383; 1 597 + 2 705 Tests.
Nebenbefund, geparkt: `aiComplete` loggt weiter 300 Zeichen Anbieter-Rumpf
(Text-Weg, nicht Teil des Audits); 413 `reading_too_large` hat keinen
eigenen UI-Satz (unter den Produkt-Deckeln unerreichbar). **Es folgt
Davids Abnahme** (Inhalts-Gates D1–D8), dann OPEN-ITEMS-COMPLETE und dieser
Plan ins Archiv.

**Abgenommen 2026-09-09 (David):** die Inhalts-Gates D1–D8 (Fundstellen-Liste in
der Sitzung) gelten als abgenommen — „ich vertraue dir erstmal hier". Korrekturen am
Wortlaut laufen ab jetzt als gewöhnliche Befunde. Vorhaben GESCHLOSSEN, Plan im Archiv.

| # | Paket | Inhalt | Gate |
| --- | --- | --- | --- |
| D0 | Verträge | Registry-Steps + Sessions (Struktur), Vokabulare, Font-Paar-Katalog, `BrandDesignPreset`, `buildBrandDesign`, Ramp-Import als Vertrag, Journey mit Freischaltung | — |
| D1 | Freischaltung + Rail + Frida | brand-020, Betreiber-Knopf, Ereignis, Layer im Rail, Beraterin mit Leitern | **David:** Inhalte (Leitern, Zielsätze) |
| D2 | Richtung: Weiche + Vorbilder + DNA + Moodboards | `g.source`, Upload-Editor (brand-022, Bucket), **Core `aiVision`** (eigener Commit, Config-Gate aus), `g.reading` mit fits/tension/off gegen die Foundation, `g.dna` aus beiden Quellen, Boards, Mix & Match, Szene `BwDesignScene` | **David:** Vision-Anbieter/ZDR (dieselbe Frage wie D5c), Davids Blick |
| D3 | Farbwelt | `h.*`, Ramp/Kontrast über den Vertrag | — |
| D4 | Typografie | `i.*`, Schriften im App-CSS, Specimen | — |
| D5 | Zeichen | D5a Richtung+Briefing, D5b SVG-Setzungen, D5c **Core** `aiImage` + Bucket/Tabelle (brand-021) + Entwürfe-Bereich | **David:** Bild-Anbieter/ZDR, Kosten |
| D6 | Bildsprache | `k.*`, Stil-Karten, optional KI-Beispiele | — |
| D7 | Motion | `l.*`, Live-Übergänge, reduced-motion | — |
| D8 | Kapitel 10 voll + Ergebnis-Board + Snapshot v2 + Beispiel Kailua mit Design | Renderer, `/brand/:id/design`, Share, `/beispiel` | Davids Blick |
| D9 | Beweis-Skript | verify-brand-design: Freischaltung → sechs Kapitel → Preset → Kapitel 10 → Snapshot v2 → kein Entwurf im Share (Gegenprobe) | — |

### 2.19 Offene Entscheidungen für die Freigabe

| # | Frage | Empfehlung |
| --- | --- | --- |
| 1 | Bild-Anbieter für Stufe 3 und Bildsprache-Beispiele: welcher Anbieter über OpenRouter erfüllt die ZDR-Bedingung des Wizards für BILDER? | Vor D5c prüfen; bis dahin Stufe 3 hinter dem Config-Gate aus — das Kapitel funktioniert ohne sie |
| 2 | Freischaltung: Betreiber-Dashboard (Knopf je Branding) oder auch per Skript (`brand:unlock-design`)? | beides — Skript für den Anfang wie `brand:invite`, Knopf im Dashboard mit D1 |
| 3 | Kapitel-Namen (de): Moodboard · Farbwelt · Typografie · Zeichen · Bildsprache · Bewegung? | so, „Bewegung" statt „Motion" im UI, `motion` bleibt Id |

---

## 3. Prototyp (Phase 3) — gebaut 2026-09-08, freigegeben 2026-09-08 (eingefroren, Davids Entscheidung 2026-09-09)

Klickdummy im Playground (`packages/brand/.playground`, Port 3009), acht
Screens nach §2.15: `/brand/demo/design/dna` (DNA mit Begründung, drei
Boards als Szenen, Mix & Match), `/color` (Kandidaten mit AA-Gate, Ramp
hell/dunkel ECHT über `themes/shared/ramp.ts` gerechnet, Grundton, Akzent,
Rollen, Kontrast-Matrix live), `/type` (sechs Paare mit ECHTEN Schriften —
Inter, Source Sans 3, Source Serif 4, Nunito Sans, Sora, PT Sans, PT Serif
über `demo-fonts.css` self-hosted, Specimen mit Live-Regeln), `/mark`
(Richtung → Briefing → SVG-Setzungen mit Varianten und Schutzraum →
vier KI-Attrappen mit Vermerk, Herkunft, Behalten/Verwerfen, Markenrechts-
Hinweis, Drossel-Zeile), `/imagery` (Stil-Karten ohne Fotos, Illustration,
Icon-Vergleich mit echten Phosphor-Varianten, Do/Don't, ausklappbare KI-
Attrappen), `/motion` (Tempo, Token-Tabelle, Szene mit „Übergang abspielen",
reduced-motion-Simulation), `/unlock` (Betreiber-Liste mit Freischaltung +
Ereigniszeile) und `/brand/demo/foundation?design=locked|unlocked|done`
(Kapitel 10 gesperrt / Einstieg / VOLL). Bausteine: `FdDesignScene`
(lokale `--ds-*`-Variablen, Hell/Dunkel je Szene, Motion-Tokens,
prefers-reduced-motion), `FdDesignWorkspace` (Werkstatt-Hülle mit Frida),
`FdDesignChapter`, `demoDesign.ts` in der Form von `BrandDesignPreset`.

Beweis (Playwright, fester Viewport): alle acht Seiten ohne Konsolen-Fehler,
alle sieben Schriftfamilien geladen (`document.fonts.check` je Familie ok),
Kontrast-Urteile AA/AAA mit Zahlen sichtbar, ein Kandidat fällt begründet
durch, Zeichen-Seite trägt Vermerk + Markenrecht + Drossel, Kapitel 10 voll
ohne „folgt in Brand Design", privater Hinweis für Entwürfe. Lint grün.

**Gelernt beim Bau:** ein `<button>` (Board-Karte) mit einer Szene darin,
die selbst einen `<button>` (Hell/Dunkel) trägt, ist ungültiges HTML — der
Browser schließt beim Parsen den äußeren, die Hydration findet einen
anderen Baum vor (0 Fehler nur nach dem Umbau: bei festem Schema ist der
Umschalter ein `<span>`). Gilt für den echten `BwDesignScene` (§2.9).

**Davids Korrekturen am lebenden Objekt (2026-09-08):** (1) Abstand zwischen
den Sessions eines Kapitels 4 rem statt 2 rem („Textwüste"). (2) Die Bühne
läuft breiter: `BwWorkspace` hat dafür die neue Prop `stageWidth`
(`--bw-stage-max`, Default 46 rem = Lesebreite); die Werkstatt-Kapitel —
Foundation UND Design, Dummy UND echte Seite `[stepKey].vue` — setzen 72 rem,
Dokument und Foundation-Leseansicht bleiben bei der Lesebreite. Gemessen:
1152 px auf der Werkstatt, 736 px auf den Leseseiten.

---

### 3.x Nachtrag 2026-09-08 — Weiche, Vorbilder, Lesung, Ergebnis-Board (Davids Entscheidung, §2.2/§2.8)

Gebaut im Playground (Commit dieser Zeile):

- **Kapitel 1 `/brand/demo/design/dna`** beginnt mit der Weiche `g.source`
  (zwei Karten: „Wir haben Vorbilder" · „Frida schlägt vor"); der zweite Weg
  ist über `?quelle=foundation` direkt erreichbar und überspringt nur Upload
  und Lesung. `g.inspiration`: fünf Attrappen-Vorbilder (`FdInspirationThumb`,
  abstrakte SVGs — KEINE echten Screenshots fremder Marken), je Karte Bereich
  als `USelect` (Farbwelt · Typografie · Zeichen · Bildsprache · Komposition),
  Notiz-Feld, Entfernen, Ablagefläche mit echtem Datei-Wähler (Object-URL im
  Tab, kein Upload), Drossel-Zeile und Privatheits-/Fremdwerk-Hinweis.
  `g.reading`: Fazit in zwei Listen („Trägt schon · 3" / „Geht besser · 2"),
  dann je Vorbild Urteil `fits`/`tension`/`off` als `bw-state`, die
  Foundation-Stelle („gemessen an: …"), die beobachteten DNA-Belegungen als
  Chips, Begründung und bei Spannung/Widerspruch der Übernehmen-/Nicht-
  übernehmen-Satz. `g.dna` zeigt je Zeile die Herkunft (Foundation ·
  Foundation + Vorbild) und den Vorbild-Satz.
- **Ergebnis-Board** `FdDesignBoard`: eine Fläche mit Farbwelt (Rampe + fünf
  Rollen), Bewegung (Tokens), Typografie (Specimen), Zeichen (Wortmarke +
  Monogramm, Schutzraum-Satz), Bildsprache (drei abstrahierte Kacheln + vier
  Regeln). Als Kopf von Kapitel 10 (`?design=done`, kompakt) UND als eigene
  Leseansicht `/brand/demo/design/board` (72 rem, Druck-CSS, rechts der Weg
  zurück in die sechs Kapitel; Rail-Ergebnispunkt und letzter Weiter-Knopf
  zeigen dorthin).
- **Beweise:** SSR 200 auf beiden Wegen (Herkunft 5×Foundation + 5×beides
  bzw. 10×Foundation), 0 Konsolenfehler auf dna/board/foundation, Typecheck
  und ESLint grün.
- **Gelernt:** der Bereich je Karte war zuerst fünf Chips — in der Dreier-
  Reihe fünf Zeilen hoch; eine Wahl je Bild ist ein Select. Der Dev-Server
  hielt nach dem Entfernen eines `<style>`-Blocks eine tote CSS-Referenz und
  zeigte das Vite-Overlay auf JEDER Seite — Neustart, kein Code-Fehler.

### 3.y Nachtrag 2026-09-08 — Hell/Dunkel-Vergleich in der Farbwelt (Davids Entscheidung)

Im Abschnitt `h.ramp` steht die Anwendungs-Szene jetzt ZWEIMAL nebeneinander,
fest gestellt (links hell, rechts dunkel) statt einmal mit Umschalter — ein
Umschalter zeigt immer nur eine Hälfte der Entscheidung. Unter jeder Szene das
Text-auf-Grund-Paar ihrer Welt mit WCAG-Urteil (Kailua: 13,5:1 hell, 19,0:1
dunkel, beide AAA), gerechnet aus denselben Rampen wie die Szene. Die Paare
sind die der Szene selbst (hell = Rampe 900 auf Papier, dunkel = Neutral 50
auf Neutral 950). Beweis: SSR 200, 0 Konsolenfehler, Lint/Typecheck grün.

## Anhang A — Recherche-Quellen (2026-09-07)

| Quelle | Sorte | Kernaussage |
| --- | --- | --- |
| brandmark.io | Logo-Generator | Logos + Visitenkarten + Social + Brand-Guide aus Name/Branche; handgemachte Schrift-Templates + generative Icons; einmalige Zahlung; „I'm not a designer" |
| tailorbrands.com/pricing | Business-in-a-box | 8 freie Logos, Pläne 0 / 199 / 249 $ pro Jahr mit Domain, Website, Print, Social; KI-Plan nach Geschäftszielen |
| logoai.com | Logo-Generator | „Type your name … logo, colors, type, and a brand kit"; mehrere KI-Modelle, Mockups, animierte Intros; „9 Mio. businesses" |
| huemint.com/about | Paletten-Werkzeug | ML-Paletten nach Kontext (Hintergrund/Vordergrund/Akzent), Kontrast-Matrix, Lock, Creativity-Regler, 1,2 Mio. Trainingsbilder; frei, API nicht-kommerziell |
| fontjoy.com | Schriftpaar-Werkzeug | Deep-Learning-Paare, Lock, Kontrast-Vergleich; frei |
| realtimecolors.com | Vorschau-Werkzeug | Palette + Schriften auf echtem Layout, hell/dunkel, 5-Farben-System mit AA/AAA, Export CSS/Tailwind/SCSS/Figma; frei, 300 k Nutzer |
| lovable.dev Brand Kit Extractor (BF1 Anhang A) | Extraktor | URL → Farben (WCAG), Schriften, Voice, Tokens, Tailwind, `design.md` |
| looka.com (Pricing, Brand Kit) | Logo + Brand-Kit-Abo | **nicht abrufbar (403)** — nach Kenntnisstand: Logo-Pakete einmalig, Brand Kit als Jahres-Abo mit Vorlagen und Guidelines; vor Verwendung prüfen |
| canva.com Brand Kit | Container | **nicht abrufbar (403)** — nach Kenntnisstand: Farben/Schriften/Logos/Vorlagen im Pro-/Teams-Plan; vor Verwendung prüfen |
| Frontify, Corebook°, standards.site, Brandkit | Container | s. docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §1.5 / Anhang A |
