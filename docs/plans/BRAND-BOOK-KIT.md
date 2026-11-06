# Brand Book & Kit (Produkt 03) — Strategie

Status: **Phase 5 — K0–K6 GEBAUT (K0–K4 auf main dae02441, K5 2026-09-09,
K6 2026-09-09 auf main 2a4f6a26; Stand je Paket mit Gelernt in §2.18). K7 und
K8 folgen je in einer EIGENEN Session (WORKFLOW „Sitzungsführung je Phase");
offene Gates: Davids Blick auf `brand.md` (K3), die Leseansicht (K4) und die
Lieferseite (K6, Screenshot liegt vor); Inhalts-Gate K5 FREIGEGEBEN
2026-09-09.** Prototyp freigegeben
2026-09-09 („Prototyp freigegeben, K0 starten"), Pakete nach §2.18
VERBINDLICH.
Vorgeschichte: Strategie geschrieben 2026-09-08, freigegeben 2026-09-09
(§1.11); Konzeption geschrieben, sechs Fragen beantwortet, Konzept freigegeben
2026-09-09 (§2.19/§2.20); Prototyp gebaut und geprüft 2026-09-09 (§3).
Kürzel in OPEN-ITEMS: **BK1**.

Arbeitsablauf: docs/referenz/WORKFLOW.md (Strategie ist Phase 1). Vorlage für
Aufbau und Tiefe: docs/archiv/BRAND-DESIGN.md §1 (Produkt 02).

---

## 0. Was das hier ist

Der Strang „Brand System" (Davids Entscheidung 2026-09-05, DECISION-LOG) läuft
BF1 Foundation-Leseansicht (✅ 2026-09-07) → Produkt 02 Brand Design
(✅ 2026-09-09) → **Produkt 03 Book & Kit**. Die beiden Vorgänger haben
ENTSCHIEDEN (Foundation) und GESTALTET (Design); Produkt 03 entscheidet
nichts Neues mehr, sondern **liefert aus**: das Brand Book als vollständiges
Handbuch, das Kit als maschinenlesbare Ausgaben (Design-Tokens, `brand.json`,
`brand.md` = „Brand Context") und die Assets (Zeichen, Pressekit). Der
Phase-1-Plan hat den Charakter der drei Schichten so festgeschrieben:
**Design = entscheiden · Book & Kit = kuratieren/exportieren · Experience =
anwenden.**

Dieses Dokument ist die Bestandsaufnahme: wo kommen wir her, wo stehen wir,
wo wollen wir hin — mit Konkurrenz, technischer Ausgangslage, Hypothesen und
den Entscheidungsfragen an David (§1.10). Die Antworten kommen nach §1.11;
die Konzeption folgt als §2 in dieser Datei.

---

## 1. Strategie

### 1.1 Wo kommen wir her

Was das Projekt zu Book & Kit schon FESTGELEGT hat (nichts davon ist neu zu
entscheiden):

- **Die Produktentscheidung (2026-08-27):** das Fundament ist frei, die
  Ableitung bezahlt. Book & Kit ist die Ableitung, die auf der Startseite als
  Erstes versprochen wird.
- **Der Schritt-Schnitt der Suite (Phase-1-Plan §5b, 2026-08-29, am Dummy
  entschieden):** „Brand Book & Kit (~8 Entscheidungen, meist Bestätigungen,
  ~15 Min): Brand Book (Kapitel aus den Schichten, Do/Don't, AI-Guidelines) ·
  Kit & Design Tokens (light/dark, Exporte CSS/Tailwind/Figma,
  maschinenlesbares brand.json) · Templates (Social-Set mit
  Wiedererkennungs-Ankern)." Dazu aus dem Marketing-Audit: **Pressekit** im
  Templates-Schritt (Logos, Boilerplate drei Längen, Fakten — „fast gratis
  aus Book + Kit").
- **Die vorgemerkte Scope-Liste (Phase-1-Plan §5b „In Phase 2 aufgenommen"):**
  Brand Kit als Design Tokens (light/dark, geprüfte Kontrast-Paare, gleiche
  Token-Namen in beiden Modi — „der größte Wettbewerbsvorsprung des ganzen
  Vorhabens"), Motion-Richtlinien, Bildsprache-System, Social-Template-Set +
  Content-Kompass, AI-Guidelines im Brand Book, maschinenlesbares
  Brand-Book-Modul (System-Prompt / brand.json), Nomenklatur-Regelwerk.
  **Vier davon sind seit Produkt 02 GEBAUT** (Motion, Bildsprache, Farbwelt/
  Ramp, Typografie, Zeichen) — Produkt 03 baut sie nicht noch einmal, es
  liefert sie aus.
- **„Brand Context" als benannter Export (DECISION-LOG 2026-09-05):** Produkt 03
  bekommt `brand.md` neben `brand.json` und den Design-Tokens. „Connect"
  (MCP/API) bleibt Phase 3+. Die Karte darüber: Discover → Audit → Compare →
  Build → **Supply**. Deckungsgleich, keine Entscheidung nötig: **kein DAM,
  kein Template-Editor.**
- **Der Name (DECISION-LOG 2026-09-05, BF1):** das freie Dokument heißt „Brand
  Foundation"; „Brand Book (24 Kapitel)" ist Produkt 03 und bezahlt. Kapitel 11
  der Foundation („Regeln für KI-Texte") ist ausdrücklich der **Teaser** auf
  das maschinenlesbare Modul aus Produkt 03; Export der Foundation ist
  Browser-Druck mit Print-CSS, kein Server-PDF.
- **Was die Startseite verspricht** (apps/branding, „Was am Ende auf dem
  Tisch liegt"): sechs Artefakte — **Brand Book** („24 Kapitel mit Do & Don't
  — inklusive AI-Guidelines"), **brand.json** („Stimme, Vokabular, Tabus —
  maschinenlesbar für jede KI"), **Design-Tokens** („Farbwelt hell/dunkel,
  Kontrast-geprüft — CSS, Tailwind, Figma", Beweis `--color-roast · #4a3123 ·
  AA geprüft`), **Pressekit** („Logos, Boilerplate in drei Längen"),
  **Content-Kompass** („3–5 Säulen mit Taktung") und **90-Tage-Plan** („Woche
  1–2 Launch-Story · 3–6 Content-Rhythmus · 7–12 Sichtbarkeit & GEO"). Die
  Team-Seite ordnet Stufe 3 „Produktion" so ein: „macht das Entschiedene
  versandfertig: Brand Book, Tokens, brand.json, Pressekit — nichts Neues,
  alles benutzbar." Die FAQ sagt: „bezahlt wird erst die Ableitung: Design,
  Brand Book, Kit."
- **Bezahlweg (BS1, Davids Entscheidungen 2026-09-07/08):** Einmalpreis je
  Branding über Stripe Checkout (Paket Z1, wartet auf A2 + R3), eigener
  Preis-Katalog für branding.supply, **B2B netto zzgl. USt**, Beta-Konten
  dauerhaft frei, Freischaltung als Feld an `brand_profiles` (Webhook +
  Betreiber-Schalter). **Offen in BS1 §9.2:** Name des Kaufgegenstands und
  Betrag — Vorschlag dort: „EIN Preis je Branding für ‚die Ableitung' =
  Marktvergleich + später Book & Kit". Für Brand Design gilt G4 unverändert:
  Studio-begleitet, kein Preis an der Schranke.
- **Extraktion des Ist-Zustands** (Farben/Schriften/Logo einer bestehenden
  Website als Relaunch-Einstieg, Hypothese H6 aus Produkt 02) ist laut
  OPEN-ITEMS „Produkt 03 vorbehalten" — sie steht damit auf dem Tisch dieser
  Strategie (Frage §1.10 g).

### 1.2 Wo stehen wir

Die sechs versprochenen Artefakte, am Code erhoben (2026-09-08):

| Versprochen | Was heute steht | Was fehlt |
| --- | --- | --- |
| **Brand Book, „24 Kapitel", Do & Don't, AI-Guidelines** | Foundation-Leseansicht `/brand/:id/foundation` mit **12 Kapiteln (0–11)**, gerendert vom puren `buildBrandFoundation` aus bestätigten Werten; Kapitel 10 „Visuelle Identität" ist seit Produkt 02 VOLL (Farbwelt, Typo-Specimen, Zeichen-SVG, Bild-Prinzipien, Motion) und hat das druckbare Ergebnis-Board `/brand/:id/design`; Do & Don't in Kapitel 5 (Werte), 6 (Stimme), 10 (Bildsprache `k.dodont`); Kapitel 11 „Regeln für KI-Texte" als fester i18n-Rahmen; Print-CSS; Share-Seite mit Snapshot v2 | Es gibt keine Zählung, die 24 ergibt. Es fehlen die REGEL-Kapitel, die ein Handbuch von einer Leseansicht unterscheiden: Zeichen-Anwendung (Schutzraum, Mindestgröße, Don'ts — Material liegt in `j.brief`), Farb-Anwendung (Rollen-Tabelle, Kontrast-Paare hell/dunkel — liegt im Preset), Nomenklatur (neu), AI-Guidelines als GUIDELINES statt Drei-Zeilen-Rahmen (Freigabe, Tabus, Prompt-Vorlagen), Anwendungsbeispiele |
| **brand.json** | nichts — in der Export-Karte der Leseansicht steht der Eintrag „brand.md · brand.json — Brand Context für KI-Agenten" seit BF1 **gesperrt mit Etikett „Brand Book & Kit"** | Schema, Route, Download; die Reise-Regel (`sessionTravels`) muss darin gelten |
| **brand.md** (Brand Context) | nichts (dieselbe gesperrte Karte) | Aufbau, Route, Download |
| **Design-Tokens CSS/Tailwind/Figma** | Das `BrandDesignPreset` trägt ALLE Werte: Basisfarbe, `rampLight`/`rampDark` (elf Stufen), Neutral-Ramp, Akzent, Rollen, **`contrastPairs`** (Urteil je Paar), Schriftpaar-Id + Skala + Regeln, Motion-`transitions` in ms mit Easing. Gerechnet, nie gespeichert (`loadBrandDesignPreset`, `null` bis alle sechs Kapitel abgenommen). Die Export-Karte zeigt „Design-Tokens — CSS, Tailwind, JSON" gesperrt | Token-Format(e), Namensschema, Route, Download, der Figma-Weg |
| **Pressekit** | Boilerplates in drei Längen (`ep.boilerplates`), Tagline, Zeichen als SVG (`j.examples`, `j.pick`), Fakten (`a.facts` — aber `sensitivity: internal`, reist NICHT) | das Bündel (Zip), eine bewusste Freigabe der Fakten, Bildregeln für Presse |
| **Content-Kompass** | nichts. Der Phase-1-Plan §5b ordnet ihn **Brand Experience** (Social) zu, die Startseite listet ihn unter den Artefakten | Zuordnung entscheiden (Frage e) |
| **90-Tage-Plan** | nichts. Der Rail-Text von Produkt 04 sagt „Assets und Pläne entlang des 90-Tage-Plans"; die Startseite listet ihn unter den Artefakten; der Rail-Text von Produkt 03 sagt „Book, Tokens, brand.json + Strategy Playbook" | Zuordnung entscheiden (Frage e) |

Dazu:

- **Die Schranke steht schon.** Die Export-Karte der Leseansicht hat vier
  Einträge: Drucken/PDF (frei, funktioniert) und drei gesperrte — Brand
  Context, Design-Tokens, Assets.zip („Logos, Vorlagen, Pressekit") — alle
  mit dem Etikett „Brand Book & Kit". Produkt 03 ist der Moment, in dem
  diese drei Knöpfe etwas tun.
- **Kapitel-Zählung:** die Startseite sagt 24, die Foundation hat 12, Produkt 02
  hat davon EINES gefüllt (Kapitel 10 als Sammelkapitel für fünf Dinge). Die
  Zahl ist ein Marketing-Versprechen aus der Dummy-Zeit ohne Deckung im
  Konzept — sie muss entweder durch eine Gliederung eingelöst oder auf die
  echte Zahl gebracht werden (Hypothese H1, Frage e).
- **Bezahlung:** kein Stripe im brand-Layer; Beta per Einladung. Z1 (Stripe
  Checkout je Branding) wartet auf A2 (Stripe echtes Geld) und R3 (Anwalt).
  Book & Kit wäre nach BS1 das ERSTE Selbstbedienungs-Produkt hinter einem
  Preis — Brand Design bleibt Studio-begleitet.
- **Berater:** `brandAdvisors.ts` kennt George, Vera, Milo, Nika, Otto
  (Foundation) und Frida (Design). Für „Produktion" gibt es keinen Berater;
  der Team-Text der Startseite nennt dort „Rex" — ein Rest der verworfenen
  Hunde-Welt (DECISION-LOG 2026-09-02), kein Steckbrief, kein Code (Frage f).
- **Themes-Engine als Token-Quelle:** `generateRamp`/`contrastRatio`/
  `wcagLevel` sind die Rechenregeln, die Produkt 02 schon über den
  A14-Vertrag nutzt; `customThemeCss` schreibt heute CSS-Variablen im
  Nuxt-UI-Namensschema (`--ui-color-primary-<stufe>`, `--ui-primary`,
  `--ui-radius`), und docs/referenz/FIGMA-KORREKTURFLAECHE.md hat die
  **Token-Brücke** nach Figma bereits beschrieben (drei Sammlungen, 41
  Variablen, Hell/Dunkel als Variablen-Modi).

### 1.3 Wo wollen wir hin — das Zielbild in einem Satz

**Book & Kit macht aus Foundation + Design ein LIEFERPAKET, das morgen in
Website, Redaktion, Designer-Briefing und KI-Werkzeugen arbeitet:** das Brand
Book als vollständiges, druckbares und teilbares Handbuch mit Regel-Kapiteln
und Do & Don't; das Kit als maschinenlesbare Ausgaben — Design-Tokens hell/
dunkel mit geprüften Kontrast-Paaren, `brand.json` und `brand.md` als Brand
Context für jede KI; die Assets als Bündel (Zeichen-SVGs, Pressekit). Alles
wird aus denselben bestätigten Werten GERECHNET, nichts gespeichert, nichts
ein zweites Mal entschieden; die wenigen Kapitel, die neu entstehen (AI-
Guidelines, Nomenklatur), sind kurze Bestätigungen in derselben Werkstatt.

Der Unterschied zu allem, was der Markt verkauft (§1.7): die Container
(Frontify, Corebook°, standards.site, Bynder) verwalten und machen KI-lesbar,
was jemand anderes entschieden hat; die Generatoren (Looka, Canva Brand Kit)
liefern Vorlagen ohne Herleitung. Wir liefern das Handbuch UND die Maschinen-
Form als ABLEITUNG einer Strategie, die im selben Werkzeug entstanden ist —
mit Begründung in jedem Kapitel und mit der Reise-Regel, die entscheidet, was
das Konto verlassen darf.

### 1.4 Was das Produkt BEWUSST NICHT behauptet

- **Kein DAM, kein Template-Editor** (DECISION-LOG 2026-09-05). Assets sind ein
  Bündel zum Herunterladen, kein verwalteter Bestand; Vorlagen werden nicht
  im Browser bearbeitet.
- **Kein „Connect".** MCP-Server, API-Zugriff und Live-Sync in fremde
  Werkzeuge bleiben Phase 3+. Brand Context ist eine DATEI, die der Kunde in
  ChatGPT, Claude, Cursor oder sein Redaktionssystem legt — das ist heute
  die tragfähigste Form (§1.7: `llms.txt`, Lovables `design.md`).
- **Kein Server-PDF, keine Figma-Datei.** Druck bleibt Browser-Druck mit
  Print-CSS (BF1-Entscheidung); Figma bekommt die Tokens als DTCG-JSON zum
  Import, nicht ein Plugin und nicht eine erzeugte Datei.
- **Keine Schriftdateien im Kit** (Hypothese H8): das Kit nennt Familien,
  Gewichte und Lizenz mit Quelle; die Dateien holt der Kunde bei der Quelle.
- **Keine neue Entscheidung über Farbe, Schrift, Zeichen, Bild, Motion.** Wer
  im Kit etwas ändern will, geht ins Design-Kapitel („Korrigieren" ist der
  einzige Rückweg — dieselbe Regel wie in der Foundation).
- **Keine Rechtsprüfung** von Zeichen oder Namen; keine Markenanmeldung.

### 1.5 Zielgruppe und Nutzen

| Wer | Nutzen von Book & Kit | Woran wir es messen |
| --- | --- | --- |
| Gründerin ohne Designer (Weiche „Neue Marke") | Farben, Schrift, Zeichen und Stimme liegen als DATEIEN vor, die Website-Baukasten, Canva, Tailwind und ChatGPT verstehen — die Marke ist am nächsten Tag benutzbar, nicht nur beschrieben | Downloads je Artefakt; Anteil der Design-fertigen Marken, die das Kit ziehen |
| Unternehmen im Relaunch (Weiche „Marken-Relaunch") | Ein Handbuch, das Agentur, Freelancer und Team auf denselben Stand bringt; Tokens, die die Entwicklerin direkt einbaut; `brand.md`, damit interne KI-Texte im Ton bleiben | Share-Aufrufe des Books durch Dritte; wiederholte Downloads nach Korrekturen |
| Studio-Kunde (Enterprise = Studio) | Das Briefing ist das Kit: Designer und Entwickler bekommen Tokens, SVGs und Regeln statt Folien — die Übergabe an Pukalani Studio wird billiger | Zeit bis zum ersten Design-Entwurf; Erstgespräche mit Kit im Anhang |
| Die Plattform selbst | `brand.json`/`brand.md` sind der Andockpunkt für spätere KI-Produkte (Community-KI in Markenstimme, SEO & GEO in Produkt 04, Monitoring) | interne Wiederverwendung des Schemas |

### 1.6 Technische Ausgangslage — was wir NICHT neu bauen

| Baustein | Existiert | Was Book & Kit daraus macht |
| --- | --- | --- |
| Foundation-Renderer | `shared/brandFoundation.ts` (`buildBrandFoundation`, pur, 12 Kapitel, Blöcke inkl. `aiRules`, `dodont`, `swatches`), Print-CSS, Inhaltsverzeichnis, Share-Seite | Das Book ist DIESELBE Leseansicht mit mehr Kapiteln und Regel-Blöcken — kein zweiter Renderer, keine zweite Seite |
| Reise-Regel | `sessionTravels` (audience + sensitivity), `brandShareableSlotValues`, fail-closed | Gilt WÖRTLICH für `brand.md`/`brand.json`/Pressekit: was nicht in den Share-Snapshot darf, darf nicht in einen Export. Fakten (`a.facts`, internal) brauchen für das Pressekit eine ausdrückliche Freigabe je Marke |
| Design-Preset | `BrandDesignPreset` v1 (`brandDesignValues.ts`, `loadBrandDesignPreset`), Snapshot v2 mit eingefrorenem Preset, `brandContrast`/`wcagLevel`, Ramps hell/dunkel | Die EINE Quelle der Tokens. Tokens werden bei jedem Abruf aus dem Preset gerechnet; Stand = `brandDesignStand` |
| Themes-Namensschema + Figma-Brücke | `customThemeCss` (`--ui-color-primary-*`), FIGMA-KORREKTURFLAECHE.md (Variablen-Modi Hell/Dunkel) | Namensschema der CSS-Ausgabe; der Figma-Weg ist DTCG-JSON-Import (Figma nativ seit Schema 2025) statt Plugin |
| Zeichen | `j.examples` (SVG-Quelltext), `j.pick`, Wortmarke/Monogramm aus Schriftpaar + Farbwelt (Produkt 02 D5b) | Assets-Bündel: SVG-Varianten (hell/dunkel, mono), plus PNG-Raster über den vorhandenen Weg? — Konzeptfrage; SVG ist gesetzt |
| Schriftpaare | `BRAND_FONT_PAIRS`, self-hosted über `@nuxt/fonts` | Kit nennt Familie/Gewichte/Quelle/Lizenz; keine Dateien (H8) |
| Werkstatt-Mechanik | Sessions, Zustandsmaschine, Abnahme, Korrektur-Regel, Berater, Bereitschafts-Gate, Eimer/Drosseln, ZDR-Routing | Schicht 3 = wenige Kapitel mit Bestätigungen (~8, ~15 Min), KI nur dort, wo etwas Neues entsteht (Frage f) |
| Export-Karte | `foundation.vue` `exportItems`: Drucken (frei) + drei gesperrte Einträge mit Etikett „Brand Book & Kit" | Die gesperrten Einträge werden Downloads; die Schranke bleibt für nicht freigeschaltete Marken |
| Freischaltung | `designUnlockedAt` + Ereignis (Produkt 02 D1, Betreiber-Schalter); BS1 Z1 plant ein Webhook-Feld an `brand_profiles` | Book & Kit hängt an dem BS1-Feld (Kauf) ODER an einem eigenen — Frage d |
| Beispielmarke | Kailua Coffee Co. (Discover, Anatomie-Seite, Design komplett) | Das öffentliche Beispiel-Kit: Book, Tokens, `brand.md` von Kailua als sichtbarer Beweis auf der Produktseite |
| Beweis-Werkzeuge | verify-Skripte, Playwright, Unit auf pure Regeln | Wie BF1/BD1; zusätzlich: Token-Datei gegen DTCG-Schema validieren, `brand.md` gegen die Reise-Regel prüfen |

### 1.7 Konkurrenz und Referenzen (Recherche 2026-09-08, Quellen in Anhang A)

Vier Sorten — und keine liefert Handbuch UND Maschinen-Form als Ableitung
einer Strategie:

1. **Guidelines-Container** — Frontify („brand intelligence… structured for
   humans and readable by AI", MCP-Server in Beta, Brand Assistant, Preis nur
   per Demo), Corebook° (KI erzeugt Guideline-Module, Figma-Sync, MCP für
   Agenten, ab 99 $/Monat für Brand Owner), standards.site (SVG-Logo hochladen
   → Farbvarianten automatisch, Pentagram/Gretel als Referenzen), Bynder (AI
   Control Center mit „Global AI Instructions", AI-Compliance-Agent). Sie
   hosten, was fertig ist; das KI-Lesbare ist ihr 2026-Verkaufsargument.
2. **Brand-Kit-Generatoren** — Looka Brand Kit (96 $/Jahr: Premium-Logodateien,
   300+ Vorlagen, Guidelines-Dokument; mit Website 129 $/Jahr), Canva Brand Kit
   (Farben/Schriften/Logos, „Brand Voice" mit 500 Zeichen + 3–5 Textproben,
   seit Februar 2026 in ChatGPT und seit Mai 2026 in Gemini eingehängt, Brand
   Kit Builder aus Website/PDF), Tailor Brands (199/249 $ pro Jahr). Vorlagen
   ohne Herleitung; die Stimme ist ein Textfeld.
3. **Token-Standards und -Werkzeuge** — das **W3C-DTCG-Format 2025.10** ist
   seit 28. Oktober 2025 die erste stabile Fassung (40+ Organisationen, u. a.
   Adobe, Figma, Google, Microsoft, Shopify); **Style Dictionary v5** liest es
   als Default (5.4.0 mit den 2025.10-Dimensionsobjekten und Hex-Fallback für
   Farbobjekte); **Figma** exportiert/importiert Variablen nativ als
   DTCG-JSON (Schema 2025), zusammengesetzte Tokens wie Typografie noch nicht;
   **Tailwind v4** definiert Tokens CSS-first im `@theme`-Block
   (`--color-*`, `--font-*`) und stellt sie zur Laufzeit als Variablen bereit.
   Alles Commodity — der Wert liegt darin, dass die Werte STIMMEN
   (hergeleitet, kontrastgeprüft, hell UND dunkel) und in einem Format
   kommen, das jedes dieser Werkzeuge liest.
4. **Kontext-Dateien für KI** — `llms.txt` (Markdown im Site-Root, Kernstück ist
   die Kurzbeschreibung im Blockquote, „Modelle zitieren sie direkt"),
   Lovables `design.md` („für KI-Agenten"), die Praxis „brand guidelines your
   agents can read" (Markdown + Tokens + Beispiele in einem Ordner). Keine
   Norm, aber eine klare Konvention: **Markdown für die Stimme, JSON für die
   Werte.**

**Was wir daraus machen:**

| Marktbefund | Folge für Book & Kit |
| --- | --- |
| Das KI-Lesbare ist 2026 das Verkaufsargument der Container (Frontify MCP, Corebook° MCP, Bynder AI Instructions, Canva in ChatGPT/Gemini) | `brand.md` + `brand.json` sind KEIN Nebenprodukt, sondern der Kern des Kits — die Markt-Lücke ist „KI-lesbar OHNE Plattform-Abo": eine Datei, die überall funktioniert. Connect (MCP) kommt später auf dieselben Daten |
| DTCG 2025.10 ist stabil und wird von Figma, Style Dictionary, Tokens Studio gelesen | EIN kanonisches `tokens.json` im DTCG-Format; CSS/Tailwind werden daraus ABGELEITET (nicht drei Wahrheiten). Figma = DTCG-Import, kein Plugin |
| Figma kann zusammengesetzte Tokens (Typografie) noch nicht nativ | Typografie-Tokens als Einzelwerte (family/weight/size) UND als Composite — der Import verliert dann nur die Bündelung, nicht die Werte |
| Tailwind v4 will `@theme` mit `--color-*`/`--font-*` | `tokens.css` trägt beide Blöcke: `:root`/`.dark`-Variablen im Themes-Namensschema UND einen `@theme`-Block — der Kunde kopiert den, der zu seinem Stack passt |
| Canva „Brand Voice" = 500 Zeichen; Frontify Brand Assistant beantwortet Fragen aus den Guidelines | Unser `brand.md` ist LÄNGER und STRUKTURIERT (Positionierung, Werte mit gelebten Beispielen, Ton-Wörter mit Stimmproben, Vokabular Benutzen/Meiden, Tabus, Boilerplates, Nomenklatur) — zum Einfügen als System-Prompt |
| Looka verkauft das Kit als Jahres-Abo, Corebook°/Frontify das Hosting als Abo; Brandmark einmalig | Wir: Einmalpreis je Branding (BS1) — das Kit gehört dem Kunden als Dateien, kein Hosting-Zwang. Der Preis muss „Dateien für immer" spiegeln, nicht „Zugang pro Jahr" (Frage d) |
| standards.site: Logo hochladen → Varianten automatisch | Unsere Zeichen entstehen als SVG aus Schriftpaar + Farbwelt — Varianten (hell/dunkel/mono) sind reine Ableitung |
| AI-Guidelines im Handbuch sind Kernbestandteil (Bynder: Guardrails, Freigabe-Workflow, Tabus, No-go-Zonen, Mensch entscheidet zuletzt) | Kapitel „AI-Guidelines" wächst über den Drei-Zeilen-Rahmen von Kapitel 11 hinaus: Was darf KI im Namen der Marke, Ton-Parameter, Tabus, Freigabe-Regel, Prompt-Vorlagen — mit einer kurzen KI-Session, weil das nicht rein ableitbar ist (Frage f) |

### 1.8 Geschäftsmodell-Einordnung

Book & Kit ist nach BS1 (Entscheidung 4, Einmalpreis je Branding) das erste
Produkt, das per **Selbstbedienung hinter einem Stripe-Checkout** steht —
Brand Design bleibt Studio-begleitet (G4). Drei Dinge folgen:

- **Der Kaufgegenstand (BS1 §9.2, offen):** BS1 schlägt EINEN Preis je
  Branding für „die Ableitung" = Marktvergleich + Book & Kit vor. Dagegen
  spräche nur, dass der Marktvergleich Analyse ist (Compare) und Book & Kit
  Lieferung (Supply). Dafür spricht: EIN Preis, EINE Schranke, EIN
  Webhook-Feld — und Kunden verstehen „die Ableitung" leichter als zwei
  Preise (Frage d).
- **Was ohne Brand Design im Kit steht:** Book & Kit kann auf der Foundation
  ALLEIN schon liefern (`brand.md`, `brand.json`, Pressekit-Texte, die
  verbalen Kapitel des Books); Design-Tokens und Zeichen-Assets brauchen das
  Preset, also alle sechs Design-Kapitel abgenommen. Verkauft man Book & Kit
  an eine Marke ohne Design, ist das Kit halb leer — das muss auf der
  Schranke ehrlich stehen („Tokens und Zeichen kommen mit Brand Design")
  oder das Produkt setzt Design voraus (Hypothese H6, Frage d).
- **Beta-Konten sind dauerhaft frei** (BS1 Entscheidung 6) — die Beta ist
  der Test, ob das Kit gezogen und benutzt wird, bevor der Preis steht.
- **Preisanker aus dem Markt** (Anhang A): Looka Brand Kit 96 $/Jahr, Web
  129 $/Jahr; Corebook° ab 99 $/Monat; Tailor Brands 199/249 $/Jahr; Brandmark
  einmalig. Unser Modell ist keines davon: einmal zahlen, Dateien behalten,
  Handbuch online teilbar solange die Marke im Konto liegt. Den BETRAG nennt
  David (BS1 §9.2 Nr. 2); die Strategie hält nur fest, dass ein Einmalpreis
  im niedrigen dreistelligen Netto-Bereich zum Markt passt und „Dateien für
  immer" gegen die Abos erklärt.

### 1.9 Risiken und Hypothesen (was die Konzeption/Beta klären muss)

- **H1 „24 Kapitel" ist ein Versprechen ohne Zählung.** Ein Handbuch auf 24
  Kapitel aufzublähen macht es schlechter (brandingstyleguides.com: 20–39
  SEITEN sind die Norm, nicht Kapitel). Die Zahl folgt der Gliederung, die
  Startseiten-Copy folgt der Zahl — nicht umgekehrt (Frage e).
- **H2 Drei Token-Wahrheiten.** CSS, Tailwind und Figma aus drei Generatoren
  laufen auseinander. EIN kanonisches DTCG-`tokens.json`, alles andere
  daraus abgeleitet und per Test deckungsgleich.
- **H3 Exporte veralten.** Ein heruntergeladenes Kit ist ein Stand. Jede Datei
  trägt Marke, Stand (Datum) und Fassung; Downloads werden als Ereignis
  gezählt; das Book online ist immer aktuell (gerechnet, nie gespeichert).
- **H4 Die Reise-Regel wird zum Leck.** `brand.md`/`brand.json` sind
  Exporte, die das Konto verlassen — sie MÜSSEN `sessionTravels` gehorchen
  (Wettbewerber-Namen, Beschwerden, Fakten reisen nicht). Pressekit-Fakten
  brauchen eine ausdrückliche Freigabe (Opt-in je Marke). Gegenprobe im Test
  wie bei G1.
- **H5 `brand.md` ist ein Prompt — seine Qualität ist messbar.** Beweis: ein
  Text, den ein Modell NUR mit `brand.md` schreibt, muss vom Brand-Check-
  Judge (Dokument-Check) als „im Ton" erkannt werden — dieselbe Maschine,
  keine neue.
- **H6 Kit ohne Design ist eine halbe Lieferung.** Ehrliche Schranke oder
  Voraussetzung — Frage d.
- **H7 KI-Kapitel kosten Eimer.** Jedes KI-Kapitel braucht Drossel, Eimer,
  Formvertrag, Live-Persona-Audit. Deshalb so wenige wie möglich (zwei),
  alles andere pure Ableitung (Frage f).
- **H8 Schriften-Lizenzen.** Self-hosted Familien (OFL/Google) dürfen wir
  ausliefern, aber die Lizenzpflichten reisen mit. Sicherer Weg: Familie,
  Gewichte, Quelle, Lizenz nennen, keine Dateien bündeln. Kunden-Schriften
  (Font-Upload, Themes) sind ohnehin nicht im Preset.
- **H9 Die Startseite verspricht Produkt-04-Dinge unter „am Ende auf dem
  Tisch".** Content-Kompass und 90-Tage-Plan sind laut Suite-Schnitt
  Experience — entweder ziehen sie als „Strategy Playbook" (Rail-Text von
  Produkt 03!) in Book & Kit, oder die Copy bekommt Produkt-Etiketten
  (Frage e).
- **H10 Extraktion (Relaunch-Einstieg) ist Build/Audit, nicht Supply.** Sie
  in Produkt 03 zu packen vermischt „liefern" mit „lesen"; als eigener
  Baustein davor oder danach bleibt Book & Kit klein (Frage g).

### 1.10 Fragen an David (die Konzeption braucht sie)

| # | Frage | Empfehlung | Alternative |
| --- | --- | --- | --- |
| a | Schnitt | **EIN Produkt „Book & Kit"** — Book ohne Kit ist eine schönere Leseansicht (die es frei schon gibt), Kit ohne Book sind Dateien ohne Regeln; EINE Schranke, EIN Kauf, EIN Rail-Layer | zwei Produkte (Book = Leseansicht/PDF-Ausbau, Kit = Tokens/Context/Assets) — zwei Preise, zwei Schranken, zwei Marketing-Texte |
| b | Ort | **Dritte Schicht derselben Werkstatt in `packages/brand`** — dieselbe Begründung wie bei Produkt 02 (DECISION-LOG 2026-09-07): Book & Kit setzt dasselbe Dokument, dieselbe Zustandsmaschine und dieselbe Reise-Regel fort; ein eigener Layer bräuchte einen expliziten Vertrag auf Preset, Renderer und `sessionTravels` — drei Verträge für null neue Datenhoheit | eigener Layer `kit` (Silo-Regel wörtlich: neues Produkt ⇒ eigener Layer) — sinnvoll erst, wenn Connect (MCP/API) als eigene Datenwelt kommt |
| c | Brand Context: Dateien und Token-Format | **Sechs Dateien, ein Bündel:** `brand.md` (Stimme, Werte, Positionierung, Vokabular, Tabus, Boilerplates, AI-Guidelines — als System-Prompt einsetzbar) · `brand.json` (dieselben Werte strukturiert + Design-Zusammenfassung) · `tokens.json` (**W3C DTCG 2025.10**, kanonisch: Farben hell/dunkel mit Kontrast-Paaren als Extension, Typo, Radius, Motion) · `tokens.css` (ABGELEITET: `:root`/`.dark`-Variablen im Themes-Namensschema + Tailwind-v4-`@theme`-Block) · Zeichen-SVGs (Wortmarke/Monogramm, hell/dunkel/mono) · `LICENSES.md` (Schriften: Familie, Gewichte, Quelle, Lizenz — keine Dateien). Figma = DTCG-Import | nur CSS-Variablen der Themes-Engine (schnell, aber Figma/Style-Dictionary außen vor) · Tailwind-Theme allein · Schriftdateien mitbündeln (Lizenzpflichten reisen mit, H8) |
| d | Bezahlt/frei | **Book & Kit = der BS1-Einmalpreis „Ableitung"** (ein Kauf je Branding, Beta-Konten frei), Freischaltung über das Z1-Webhook-Feld + Betreiber-Schalter. Frei bleibt die Foundation-Leseansicht inkl. Kapitel 11 (Teaser). **Kit-Teile, die Design brauchen (Tokens, Zeichen), zeigen ohne Preset ehrlich „kommt mit Brand Design"** — das Produkt setzt Design NICHT voraus, damit die verbale Hälfte (`brand.md`, Pressekit-Texte) auch Foundation-only-Marken erreicht. Den BETRAG nennt David (BS1 §9.2) | eigener Preis für Produkt 03 neben dem Marktvergleich · Book & Kit setzt abgenommenes Brand Design voraus (Kit immer voll, aber nur Studio-Kunden erreichen es) · Book frei, nur Kit bezahlt |
| e | Umfang der Kapitel | **Gliederung statt Zahl:** die 12 Kapitel der Foundation bleiben; neu als Regel-Kapitel: **Zeichen-Anwendung** (Schutzraum, Mindestgröße, Varianten, Don'ts — aus `j.brief`/`j.examples`, Ableitung), **Farb-Anwendung** (Rollen-Tabelle, Kontrast-Paare hell/dunkel — aus dem Preset, Ableitung), **Typografie-Anwendung** (Skala, Regeln — Ableitung), **Nomenklatur** (Namensmuster je Produkttyp — KI, Ausbau von B2), **AI-Guidelines** (Ausbau von Kapitel 11 — KI-Session), **Pressekit** (Boilerplates, Fakten mit Freigabe, Zeichen — Ableitung). Bildsprache und Motion bleiben in Kapitel 10 (schon voll). **Content-Kompass und 90-Tage-Plan gehen nach Produkt 04** (Suite-Schnitt), die Startseiten-Copy bekommt Produkt-Etiketten und die echte Kapitelzahl | „24 Kapitel" einlösen (Kapitel 10 in fünf Einzelkapitel teilen, Anwendungen aufsplitten — dann zählt es) · Content-Kompass + 90-Tage-Plan als „Strategy Playbook" in Produkt 03 (Rail-Text sagt das heute) · Nomenklatur streichen |
| f | KI-Anteil und Stimme | **Zwei KI-Kapitel, keine neue Stimme:** Nomenklatur entwirft **Otto** (Naming, existiert), AI-Guidelines entwirft **Nika** (Sprache, existiert); alles andere ist pure Ableitung ohne Frage. **George** übergibt und schließt (Gastgeber). „Rex" aus dem Team-Text verschwindet (Rest der Hunde-Welt); die Copy nennt die Rolle „Produktion" ohne neuen Namen | neue Stimme „Produktion" mit Steckbrief (Kosten: Persona-Audit, Team-Seite, i18n) · alle sechs Regel-Kapitel mit KI-Entwurf (mehr Eimer, mehr Audit, H7) · null KI (Nomenklatur und AI-Guidelines nur als Rahmen) |
| g | Extraktion des Ist-Zustands (Relaunch-Einstieg, H6 aus Produkt 02) | **Eigener Baustein NACH Book & Kit** („Brand Extract": URL → Farben/Schriften/Logo als Vorbelegung der Design-Kapitel), nicht Teil von 03 — Supply liefert, Extraktion liest | in Produkt 03 mitbauen (größer, andere Werkstatt-Stelle) · vor Book & Kit einschieben |

### 1.11 Entscheidungen (David, 2026-09-09, Fragenrunde) — die Strategie ist damit FREIGEGEBEN

§1.10 bleibt unverändert stehen: ohne die Empfehlungen wäre nicht mehr
nachvollziehbar, wovon abgewichen wurde.

| # | Frage | Entscheidung | Einordnung |
| --- | --- | --- | --- |
| a | Schnitt | **EIN Produkt „Book & Kit"** — eine Schranke, ein Kauf, ein Rail-Layer | nach Empfehlung |
| b | Ort | **Dritte Schicht derselben Werkstatt in `packages/brand`** — dasselbe Dokument, dieselbe Zustandsmaschine, dieselbe Reise-Regel; die Silo-Regel „neues Produkt ⇒ eigener Layer" wird wie bei Produkt 02 bewusst nicht angewandt (Begründung im DECISION-LOG) | nach Empfehlung |
| c | Brand Context | **Sechs Dateien, ein Bündel:** `brand.md` · `brand.json` · `tokens.json` (W3C DTCG 2025.10, KANONISCH) · `tokens.css` (abgeleitet: Themes-Variablen + Tailwind-v4-`@theme`) · Zeichen-SVGs (hell/dunkel/mono) · `LICENSES.md` (Schriften benannt, keine Dateien). Figma über DTCG-Import, kein Plugin | nach Empfehlung. Folge für die Konzeption: EIN Token-Modell, aus dem CSS/Tailwind gerechnet werden, mit Test auf Deckungsgleichheit (H2) |
| d | Bezahlt/frei | **Book & Kit = der BS1-Einmalpreis „Ableitung"** (ein Kauf je Branding, Marktvergleich im selben Preis, Beta-Konten frei), Freischaltung über das Z1-Webhook-Feld + Betreiber-Schalter. Frei bleibt die Foundation-Leseansicht inkl. Kapitel 11. Ohne abgenommenes Brand Design zeigen Tokens und Zeichen ehrlich „kommt mit Brand Design" — Design ist keine Voraussetzung | nach Empfehlung. Folge: BS1 §9.2 Nr. 1 (Name des Kaufgegenstands) ist damit inhaltlich beantwortet — „die Ableitung" = Marktvergleich + Book & Kit; der Wortlaut auf Seite/Rechnung bleibt eine Z1-Eingabe |
| e | Kapitel-Umfang | **Gliederung statt Zahl:** die 12 Foundation-Kapitel bleiben; neu als Regel-Kapitel Zeichen-Anwendung, Farb-Anwendung, Typografie-Anwendung, Pressekit (reine Ableitung) sowie Nomenklatur und AI-Guidelines (KI). **Content-Kompass und 90-Tage-Plan gehen nach Produkt 04** (Brand Experience); die Startseiten-Copy bekommt Produkt-Etiketten und die echte Kapitelzahl, der Rail-Text von Produkt 03 verliert „Strategy Playbook" | nach Empfehlung. Folge: die „24 Kapitel" der Startseite werden in der Konzeption durch die gezählte Gliederung ersetzt (Copy-Änderung, kein Buch-Aufblähen, H1) |
| f | KI-Anteil und Stimme | **Zwei KI-Kapitel, keine neue Stimme:** Nomenklatur entwirft Otto, AI-Guidelines entwirft Nika; alles andere pure Ableitung ohne Frage; George übergibt und schließt. „Rex" verschwindet aus dem Team-Text, die Rolle heißt „Produktion" | nach Empfehlung. Folge: zwei Eimer, zwei Formverträge, zwei Persona-Audits (H7) |
| g | Extraktion des Ist-Zustands | **Eigener Baustein NACH Book & Kit** („Brand Extract": URL → Farben/Schriften/Logo als Vorbelegung der Design-Kapitel) — nicht Teil von 03 | nach Empfehlung. Folge: eigene Zeile in OPEN-ITEMS erst, wenn BK1 gebaut ist; bis dahin Vermerk in der BK1-Zeile |
| — | Betrag | **149 € netto je Branding** (B2B, einmalig) für „die Ableitung" | GEGEN die Empfehlung „offen lassen bis Z1". Leitplanke: der Betrag ist die Eingabe für den Preis-Katalog in BS1 Z1 (`tax_behavior: 'exclusive'`), erscheint aber vor Z1 NIRGENDS im Produkt — an der Schranke steht bis dahin weiter kein Preis (G4-Logik), und die Beta bleibt frei. Markt-Einordnung: unter Looka Brand Kit + Website (129 $/Jahr) auf zwei Jahre, über Looka Kit (96 $/Jahr) im ersten Jahr |

Nächste Phase: **Konzeption** (§2 in dieser Datei) — Verträge für das
Token-Modell (DTCG-Schema, Ableitung CSS/Tailwind, Kontrast-Paare als
Extension), `brand.md`/`brand.json`-Aufbau mit Reise-Regel, die neuen
Regel-Kapitel als Sessions der Schicht 3 (Otto/Nika-Leitern als Davids
Inhalts-Gate), Assets-Bündel, Freischaltung über das Z1-Feld, Messung
(Downloads als Ereignisse, H5-Beweis über den Dokument-Check), Pakete.

---

## 2. Konzeption (Phase 2, 2026-09-09 — zur Freigabe)

Alles hier folgt den Entscheidungen in §1.11. Offene Punkte stehen als
Fragen in §2.19, nicht als Vorbehalt im Text. Kein Code vor der Freigabe.

### 2.1 Produktform: dritte Schicht derselben Werkstatt + eine Lieferseite

Book & Kit hat ZWEI Gesichter, und beide leben im brand-Layer:

- **Die Werkstatt (Schicht 3, „Book & Kit")** — drei Kapitel, additiv in
  `BRAND_STEP_KEYS` hinter Brand Design, eigene Konstante
  `BRAND_KIT_STEP_KEYS` + `isBrandKitStep()` (dieselbe Begründung wie bei
  `BRAND_DESIGN_STEP_KEYS`: mehrere Rechnungen meinen ausdrücklich EINE
  Schicht): `nomenclature` (Nomenklatur, Otto), `aiguide` (AI-Guidelines,
  Nika), `presskit` (Pressekit, reine Ableitung + eine Freigabe). Je Kapitel
  eine `brand_steps`-Zeile, Sessions nach dem BW2-Vertrag (`defineSession`),
  Abnahme, Prüfblick, Korrektur-Regel — NICHTS Neues an der Zustandsmaschine.
  ~8 Sessions, meist Bestätigungen, ~15 Minuten (Phase-1-Plan §5b).
- **Die Lieferseite `/brand/:id/kit`** (Ebene „Supply") — KEIN Werkstatt-
  Kapitel, sondern eine Lese-/Download-Seite wie das Ergebnis-Board
  `/brand/:id/design`: Kacheln je Datei mit Vorschau, Einzel-Downloads, das
  Bündel, der Stand, und ehrlich, was fehlt. Entschieden wird dort nichts
  (§1.11 a: „Book & Kit = kuratieren/exportieren").
- **Das Book** ist DIESELBE Leseansicht `/brand/:id/foundation` mit mehr
  Kapiteln (§2.5) — kein zweiter Renderer, keine zweite Seite. Für den
  Fremdleser (Share) und den Druck gilt derselbe Aufbau.
- **Gating:** Schicht 3 und die Lieferseite öffnen, wenn die Marke
  **freigeschaltet** ist (§2.8, „Ableitung"). Die Foundation muss ihr
  Ergebnis-Kapitel abgeschlossen haben (`result` done); Brand Design ist
  KEINE Voraussetzung (§1.11 d) — was Design braucht, sagt es (§2.6).
- **Ort in der Oberfläche:** derselbe Rail (Layer „Book & Kit" wird ein
  echter Layer mit drei Kapiteln + dem Eintrag „Kit"), dasselbe Dokument
  („Euer Branding" bekommt die drei Kapitel), dieselbe Leseansicht.

### 2.2 Kapitel `nomenclature` — Namensmuster je Produkttyp (Otto)

Ausbau von B2 (Markenarchitektur). **Nur auf dem Weg, den B2 gelaufen ist:**
`includeStep('nomenclature')` = `includeStep('architecture')`; ohne
Untermarken ist das Kapitel `junction_off` wie `architecture` selbst.

| Session | Typ | Editor | Generator | Inhalt |
| --- | --- | --- | --- | --- |
| `m.types` | choice | chips | none | Welche Produkttypen gibt es (Produkt, Dienstleistung, Programm/Format, Ort/Filiale, Digital)? Mehrfachwahl, Katalog |
| `m.patterns` | derivation | stage | draft | Je gewähltem Typ EIN Namensmuster mit Beispiel — hergeleitet aus `b2.model`, `b2.rule`, `f.decision` (falls gelaufen), `d.toneWords`. Otto entwirft, der Mensch korrigiert |
| `m.rules` | stage-edit | stage | none | Die Regeln als Liste (Groß-/Kleinschreibung, Trennzeichen, Reihenfolge Dachmarke/Produkt, was nie) — vorbefüllt aus `m.patterns`, Bestätigung |

Ottos Leiter und Zielsätze sind Davids Inhalts-Gate wie in BW2 Paket 2 und
BD1 D1. `audience: 'foundation'` für alle drei (Festlegungen).

### 2.3 Kapitel `aiguide` — AI-Guidelines (Nika)

Ausbau von Kapitel 11. Der feste Drei-Zeilen-Rahmen bleibt die kostenlose
Fassung; hier entstehen die Guidelines, die der Markt als Kernbestandteil
nennt (§1.7: Guardrails, Freigabe, Tabus, Mensch entscheidet zuletzt).

| Session | Typ | Editor | Generator | Inhalt |
| --- | --- | --- | --- | --- |
| `n.scope` | choice | cards | none | Was darf KI im Namen der Marke ERZEUGEN: Entwürfe für alles · nur Text · nur intern · nichts Kundenseitiges. Katalog, eine Wahl |
| `n.review` | choice | cards | none | Freigabe-Regel: jede Veröffentlichung durch einen Menschen · Stichprobe · Kanal-abhängig. Katalog |
| `n.guardrails` | derivation | stage | draft | Die Leitplanken als Liste: Ton-Parameter (aus `d.toneWords`, `d.voiceSamples`), Tabus (aus `d.vocabulary` avoid, `ep.vocabulary` avoid), Markenzeichen-Schreibweisen (Titel, Tagline, Produktnamen aus `m.rules`), No-go-Themen. Nika entwirft, Mensch korrigiert |
| `n.prompts` | derivation | none | none | DREI Prompt-Vorlagen, PUR gerechnet (kein KI-Aufruf): „System-Prompt" (= `brand.md`-Kurzform), „Social-Post", „E-Mail an Kunden" — aus Werten + `n.guardrails`. Ableitung, nur lesen/kopieren |

Kapitel 11 der Leseansicht (`ki-texte`, Anker bleibt) zeigt nach Abnahme
die Guidelines statt des Rahmens (§2.5). `audience: 'foundation'`.

### 2.4 Kapitel `presskit` — das Pressekit (Ableitung + eine Freigabe)

Nichts Neues entsteht, aber ZWEI Dinge muss ein Mensch sagen:

| Session | Typ | Editor | Generator | Inhalt |
| --- | --- | --- | --- | --- |
| `p.facts` | choice | chips | none | **Welche Fakten aus `a.facts` reisen dürfen** — `a.facts` ist `internal` und bleibt es; hier wählt der Mensch je Eintrag „ins Pressekit" (Opt-in je Fakt, Default: keiner). Der gewählte Teil wird als NEUER Wert dieser Session gespeichert (`audience: 'foundation'`, `sensitivity: 'public'`) — die Reise-Regel bleibt unverändert, weil nicht `a.facts` reist, sondern eine bewusste Auswahl daraus |
| `p.contact` | question | cards + text | none | Presse-Kontakt (Name, Rolle, E-Mail) — neu, reist BY DESIGN (`public`/`foundation`); optional. **Davids Zuschnitt (§2.20 Nr. 3): vorhandene Ansprechpartner-Daten als wählbare VORLAGE** — Karten „Konto-Inhaber (Name, E-Mail des Besitzers)" und, falls es für diese Marke eine Erstgespräch-Anfrage gibt (`brand_intro_requests`: Name, E-Mail, Telefon), „Kontakt aus dem Erstgespräch"; dazu „Anders eingeben". Die Karte FÜLLT das Textfeld vor, gespeichert wird immer der bestätigte Text (kein Verweis auf Konto-Daten, die sich später ändern); der Mensch sieht vor der Abnahme, dass diese Angabe öffentlich reist |
| `p.summary` | derivation | none | none | Vorschau des Pressekits, PUR: Boilerplates drei Längen (`ep.boilerplates`), Tagline, Zeichen-Setzungen (aus dem Preset, falls da), Fakten (aus `p.facts`), Kontakt. Nur lesen |

Keine KI in diesem Kapitel.

### 2.5 Das Book — die Leseansicht wächst (Regel-Kapitel)

`BRAND_FOUNDATION_CHAPTER_IDS` wird ADDITIV erweitert (Anker sind so
unveränderlich wie Slot-Ids). Neue Ids und Ort im Inhaltsverzeichnis:

| Anker | Kapitel | Gefüllt aus | Zustand ohne Freischaltung | Zustand ohne Design-Preset |
| --- | --- | --- | --- | --- |
| `nomenklatur` (nach `architektur`) | Nomenklatur | `m.types`, `m.patterns`, `m.rules` | entfällt (kein Wert) | — |
| `zeichen-anwendung` (nach `visuell`) | Zeichen-Anwendung | Preset `mark` (kind, brief, examples), `brandMarkClearSpaceText`, `BRAND_MARK_MIN_WIDTH_*`, Varianten hell/dunkel/mono | `locked` mit CTA „Book & Kit" (wie Kapitel 10 vor Design) | `locked` mit Satz „kommt mit Brand Design" |
| `farbe-anwendung` (danach) | Farb-Anwendung | Preset `color`: Rollen-Tabelle mit Hex, Ramp hell/dunkel, **Kontrast-Paare mit Urteil**, Neutral, Akzent, Regel „nie Text auf …" aus den fehlgeschlagenen Paaren | `locked` | `locked` |
| `typografie-anwendung` (danach) | Typografie-Anwendung | Preset `type`: Paar, Skala als Größen-Tabelle (aus `BRAND_TYPE_SCALES` + Rechenregel D4), Regeln `i.rules`, Lizenz-Zeile | `locked` | `locked` |
| `pressekit` (vor `ki-texte`) | Pressekit | `p.summary`-Quellen | entfällt | steht (ohne Zeichen-Bilder) |
| `ki-texte` (bestehend) | Regeln für KI-Texte → **AI-Guidelines** | Rahmen wie heute; nach Abnahme von `aiguide` zusätzlich `n.scope`, `n.review`, `n.guardrails`, `n.prompts` als Blöcke | Rahmen (frei) | — |

Neue Block-Arten im Renderer (`BrandFoundationBlock`): `table` (Kopf +
Zeilen, für Rollen/Kontrast/Skala), `rules` (nummerierte Regel-Liste mit
optionalem Don't), `prompt` (kopierbarer Vorlagen-Block), `contact`. Der
`design`-Block von Kapitel 10 bleibt, wie er ist. Die drei Anwendungs-Kapitel
lesen DASSELBE Preset wie Kapitel 10 — keine zweite Wahrheit, nur eine
zweite Zoomstufe (Kapitel 10 = Vitrine, Anwendung = Regelwerk).

Print-CSS deckt die neuen Kapitel automatisch (Seitenumbruch je Kapitel);
Tabellen bekommen `page-break-inside: avoid`. Share-Snapshot: die neuen
Foundation-Kapitel reisen wie alle anderen über `sessionTravels`; die
Anwendungs-Kapitel werden beim Lesen aus dem eingefrorenen Preset gerechnet
(Snapshot bleibt v2 — die FORM ändert sich nicht).

### 2.6 Das Kit — Dateien und Verträge (§1.11 c)

Alles wird bei jedem Abruf aus den bestätigten Werten + Preset GERECHNET.
Es gibt keine Spalte, keinen Cache, keine gespeicherte Datei. Jede Datei
trägt Marke, Stand (jüngstes `$updatedAt` der beteiligten Kapitel, wie
`brandDesignStand`) und Fassung des Formats.

| Datei | Quelle | Pure Regel | Braucht Design? |
| --- | --- | --- | --- |
| `brand.md` | `BrandFoundationView` (dieselbe wie das Book) + Preset | `renderBrandContextMarkdown(view, preset, locale)` | nein (visueller Abschnitt entfällt ohne Preset) |
| `brand.json` | dieselben Quellen | `buildBrandContextJson(view, preset)` | nein |
| `tokens.json` | Preset | `buildBrandTokens(preset)` → DTCG | **ja** |
| `tokens.css` | `tokens.json` | `renderBrandTokensCss(tokens)` | **ja** |
| `marks/*.svg` | Preset `mark.examples` + `brandMarkVariantColors` | `renderBrandMarkFiles(preset)` | **ja** |
| `LICENSES.md` | `BRAND_FONT_PAIRS` (neue Felder) | `renderBrandLicenses(preset)` | ja (ohne Preset nur der Hinweis) |
| `README.md` | Manifest | `renderBrandKitReadme(manifest)` | nein |

**`brand.md` — Aufbau** (Sprache = `contentLocale`; nur Werte, die
`sessionTravels` bejaht; eine H1 mit dem Markennamen, dann Abschnitte):
1. Kopf: Marke, Stand, „Brand Context aus branding.supply", Hinweis „als
   System-Prompt einsetzbar".
2. Wer wir sind — Pitch, Purpose/Vision/Mission, Positionierung
   (Kategorie, „Erste Wahl für").
3. Werte — je Wert Definition + gelebtes Beispiel + Konfliktregel.
4. Stimme — Archetyp (Haupt/Neben), Ziel-Gefühl, Ton-Wörter je mit einer
   Stimmprobe, Vokabular „Benutzen / Meiden", Tabu-Wörter.
5. Botschaften — Tagline, Boilerplates (kurz/mittel/lang), Kernbotschaften je
   Zielgruppe, unverwechselbares Merkmal.
6. Nomenklatur (wenn gelaufen) — Muster + Regeln.
7. Regeln für KI — `n.scope`, `n.review`, `n.guardrails`; ohne `aiguide` der
   Drei-Zeilen-Rahmen.
8. Visuell in einem Absatz (nur mit Preset) — Basisfarbe + Rollen mit Hex,
   Schriftpaar, Bild-Prinzipien, Motion-Tempo; Verweis auf `tokens.json`.

**`brand.json` — Aufbau:** `{ schemaVersion: 1, brand: { title, locale,
stand }, foundation: { story, chapters: [{ id, slots: [{ id, value }] }] },
nomenclature?, aiGuidelines?, presskit?, design: BrandDesignSnapshotPreset |
null }`. Die `chapters` sind die Snapshot-Kapitel (dieselbe Auswahl wie
`share.post.ts`, dieselbe Reise-Regel); `design` ist das Snapshot-Preset ohne
`keptDrafts`. Typ in `shared/types/brand.ts`, Zod-Schema für den Test.

**`tokens.json` — DTCG 2025.10.** Farben als Objekte (`colorSpace: 'srgb'`,
`components`, `hex`), Dauern als `{ value, unit: 'ms' }`, Easing als
`cubicBezier`, Schriften als `fontFamily` (Array mit Rückfall-Stack),
Typografie-Skala als `typography`-Composite UND als Einzeltokens (Figma
importiert Composites noch nicht, §1.7). **Hell/Dunkel:** die Norm kennt
keine Modi (Anhang A) — wir führen sie als GESCHWISTER-GRUPPEN
`color.light.*` / `color.dark.*` mit Rollen als Aliasse in die Rampen
(`{color.brand.600}`); Figma bildet sie beim Import auf zwei Modi ab, Style
Dictionary auf zwei Sets. Kontrast-Paare stehen in
`$extensions["supply.branding/contrast"]` je Rollen-Token (Paar-Id, Verhältnis,
Urteil) — sie sind Beleg, kein Token. Aufbau:

```
color.brand.{50…950}            Ramp hell (aus rampLight)
color.brand-dark.{50…950}       Ramp dunkel (aus rampDark)
color.neutral.{50…950}          Neutral-Ramp
color.accent                    Akzent
color.light.{role}              Rollen hell → Alias  (primary, surface, text, …)
color.dark.{role}               Rollen dunkel → Alias
font.heading / font.body        fontFamily + Stack
font.weight.heading             fontWeight
type.scale.{h1…small}           dimension + typography-Composite
radius.mark                     dimension (aus brandMarkRadiusPercent)
motion.duration.{fast…}         duration  (aus transitions)
motion.easing.{…}               cubicBezier
```

**`tokens.css` — abgeleitet, zwei Blöcke in einer Datei:**
(1) `:root { --ui-color-primary-<stufe> … --ui-primary … --brand-font-heading
… --brand-motion-fast }` und `.dark { … }` im Themes-Namensschema
(`customThemeCss` ist das Vorbild — Namen, nicht Code, werden übernommen);
(2) ein `@theme { --color-brand-<stufe>; --font-heading; --radius-mark;
--ease-brand }`-Block für Tailwind v4. Kommentarkopf mit Stand. **Test der
Deckungsgleichheit:** jeder Hex in `tokens.css` stammt aus `tokens.json`;
jede Rolle beider Modi kommt in beiden Blöcken vor.

**`marks/`** — je gesetztem Beispiel (Wortmarke, Monogramm; `j.pick`
markiert das Primäre): `<slug>-wordmark-light.svg`, `-dark.svg`, `-mono.svg`,
`<slug>-monogram-*.svg`. SVG-Quelltext aus dem Preset (katalog-gebaut, kein
Nutzer-SVG); Schriften werden in den SVGs als Stack referenziert (keine
Einbettung, H8). **Kein PNG-Raster** in dieser Fassung (§2.16).

**`LICENSES.md`** — je Familie des Paares: Name, Gewichte, Quelle (URL),
Lizenz (SPDX), Hinweis „Dateien bei der Quelle laden". Dafür bekommt
`BrandFontPair` die Felder `headingLicense`/`bodyLicense` (`{ spdx, source }`),
Test: jedes Paar hat beide.

**Bündel:** `<slug>-brand-kit-<stand>.zip` mit allen vorhandenen Dateien +
`README.md` (Inhalt, Stand, wie einsetzen). Gebaut in-memory mit `fflate`
(pure, klein; Katalog-Eintrag), Deckel 5 MB (`413 kit_too_large`, wie
`snapshot_too_large`). Ohne Design-Preset fehlen Tokens, Marken und
Lizenzen — die README nennt das.

### 2.7 Oberfläche

- **Rail:** Layer 3 „Book & Kit" — gesperrt mit Info-Layer (Erklär-Text aus
  dem Dummy, aktualisiert um „Brand Context"), freigeschaltet: drei Kapitel
  + Eintrag „Kit" (→ `/brand/:id/kit`) + eigener Stand „x von 3".
- **Werkstatt-Kapitel:** dieselben Instrumente (cards/chips/stage/text);
  `p.facts` ist eine Chip-Auswahl über die Einträge von `a.facts` (Anzeige
  der internen Rohwerte NUR dem Besitzer, wie im Dokument heute).
- **Lieferseite `/brand/:id/kit`:** Kopf mit Marke, Stand, „Bündel laden";
  darunter Kacheln: Brand Context (`brand.md` mit gerenderter Vorschau +
  „Kopieren" + „Laden"; `brand.json`), Design-Tokens (Swatch-Tabelle hell/
  dunkel mit Kontrast-Urteil, `tokens.json`/`tokens.css`), Zeichen (SVG-
  Varianten), Pressekit (Vorschau, Fakten-Freigabe verlinkt), Lizenzen.
  Kacheln, die Design brauchen, zeigen ohne Preset die ruhige Sperr-Fläche
  „kommt mit Brand Design" + CTA (Studio, wie Kapitel 10).
- **Leseansicht:** die Export-Karte wird echt — Brand Context (Menü:
  `brand.md`, `brand.json`), Design-Tokens (`tokens.json`, `tokens.css`),
  Assets (Bündel). Ohne Freischaltung bleiben die drei Einträge gesperrt wie
  heute; das Etikett „Brand Book & Kit" wird ein Link zur Schranke.
- **Schranke** (nicht freigeschaltet): Kapitel-Sperrfläche in der Werkstatt
  und die gesperrten Einträge zeigen „Book & Kit ist Teil der Ableitung" +
  CTA `useBrandCompletionCta()` (Erstgespräch) — **kein Preis** (§1.11 d,
  bis Z1). Beim Fremdleser (Share) ein Satz ohne CTA.
- **Betreiber:** die Seite `/dashboard/brand-design` wird
  `/dashboard/brand-unlocks` mit ZWEI Spalten je Marke — „Brand Design" und
  „Ableitung (Book & Kit + Marktvergleich)" — jeweils Knopf, Bestätigung,
  Chip „Frei seit …/via …". Alte Route bleibt als Weiterleitung.
- **Beispiel:** die Discover-Anatomie von Kailua bekommt den Abschnitt „Das
  Kit" mit den echten Dateien aus `KAILUA_COFFEE_EXAMPLE` +
  `KAILUA_COFFEE_DESIGN` (statisch gerechnet, öffentlich, `Cache-Control:
  public`), und die Startseiten-Artefakte verlinken dorthin.

### 2.8 Freischaltung „Ableitung" (§1.11 d) — EIN Feld, drei Schreiber

- Migration **brand-025** (additiv): `brand_profiles.derivationUnlockedAt`
  (datetime | null), `derivationUnlockedVia` (`'operator' | 'purchase'`),
  `derivationUnlockedBy` (userId | Stripe-Event-Id). Kein Index.
- **Pure Regel** `resolveDerivationAccess({ betaAccount, unlockedAt })` in
  `shared/brandDerivation.ts`: `betaAccount` (Konto hat `brand_access`, BS1
  Entscheidung 6 „dauerhaft frei") ODER `unlockedAt` ⇒ `{ unlocked: true,
  grant: 'beta' | 'operator' | 'purchase' }`. Die ROUTEN fragen nur diese
  Regel.
- **Drei Schreiber:** (1) Beta = keine Schreibung, die Regel liest
  `brand_access`; (2) Betreiber-Knopf (`POST /api/brand/admin/profiles/:id/
  derivation-unlock|-lock`, `users.manage`, Ereignis `derivation.unlocked` /
  `.locked`); (3) BS1 Z1 später: der Stripe-Webhook schreibt dasselbe Feld
  mit `via: 'purchase'` — BK1 baut das Feld, Z1 den dritten Schreiber.
- **Der Marktvergleich liest dieselbe Regel:** `resolveMarketPaywall` bekommt
  die zweite Eingabe `derivationUnlocked` (genau die Erweiterung, die die
  Datei selbst vorschreibt); BS1 §4.1 (b) ist damit eingelöst — als Feld
  statt Tabelle (BS1 §9.1).
- **Journey:** Schicht 3 ohne Freischaltung ⇒ `includeStep` = nicht auf dem
  Weg (Grund `derivation_locked`), NICHT gesperrt — sonst zählten die Kapitel
  im Fortschritt mit (D0-Lehre). Die Freischaltung legt die drei
  `brand_steps`-Zeilen an (D1-Lehre: sonst 404 auf dem Kapitel).

### 2.9 API

Alle Profil-Routen hinter `requireBrandAccess` + Besitz (fremd ⇒ 404 wie die
Datentür) + `resolveDerivationAccess` (gesperrt ⇒ `403 derivation_locked`
mit `reason`, damit die Oberfläche die Schranke zeigt).

| Route | Antwort |
| --- | --- |
| `GET /api/brand/profiles/:id/kit` | `BrandKitManifest`: Stand, je Datei `{ id, available, reason?, bytes }`, `designReady`, `chapters` (Stand der drei Kapitel) |
| `GET /api/brand/profiles/:id/kit/:file` | die Datei (`brand.md`, `brand.json`, `tokens.json`, `tokens.css`, `licenses.md`, `marks/<name>.svg`) mit `Content-Disposition: attachment; filename*=…`, `Cache-Control: private, no-store`; fehlende Voraussetzung ⇒ `409 kit_file_unavailable` + `reason` |
| `GET /api/brand/profiles/:id/kit.zip` | das Bündel; `413 kit_too_large` |
| `GET /api/brand/example/kit/:file` · `…/kit.zip` | Kailua, öffentlich, `public, max-age=3600` |
| `POST /api/brand/admin/profiles/:id/derivation-unlock` · `-lock` · `GET …/derivation-unlocks` | wie die Design-Pendants |
| Kapitel-Routen | die bestehenden `steps/*`-Routen; `nomenclature`/`aiguide` nutzen `advisorGenerator` mit Otto/Nika |

Antworttypen in `shared/types/brand.ts`, an beiden Enden verlangt
(CLAUDE.md, Nitro-Routen-Typisierung aus).

### 2.10 Datenmodell und Migrationen (additiv)

- **brand-025:** die drei Freischalt-Spalten (§2.8).
- **Registry:** drei Steps, ~10 Sessions (§2.2–2.4); `audience`/`sensitivity`
  wie angegeben; `p.facts` ist die EINZIGE Session, deren Wert aus einem
  `internal`-Slot ABGELEITET und trotzdem `public` ist — der Kopfkommentar
  erklärt, warum (bewusste Auswahl statt Durchreichung), der Registry-Wächter
  bekommt eine Ausnahme mit Test.
- **Berater:** Otto `steps: ['naming', 'nomenclature']`, Nika `steps:
  ['manifesto', 'verbal', 'aiguide']`, George `steps: ['context', 'result',
  'presskit']` (Gastgeber liefert aus). Kein neuer Steckbrief.
- **Schriftpaare:** `headingLicense`/`bodyLicense` je Paar (§2.6).
- **Kapitel-Ids:** fünf neue Anker (§2.5), Titel-Schlüssel in beiden
  Sprachen, `check:i18n-keys` grün.
- Keine neue Tabelle, kein Bucket: Exporte werden nie gespeichert.

### 2.11 KI, Kosten, Drosseln

- Zwei Entwurfs-Sessions (`m.patterns`, `n.guardrails`) über denselben
  Transport (`advisorGenerator`, ZDR-Routing, Eimer `slot` 10/Tag je Slot,
  Konto 200/Tag, Instanz-Deckel). Gespräch (`converse`) wie in jedem Kapitel.
- `n.prompts`, `p.summary`, alle Exporte: **null KI-Aufrufe.**
- **Download-Eimer (nicht KI, CPU):** `kitDay` 60 Abrufe je Marke und Tag
  (Zip zählt 5), Code `brand_kit_limit` — die Zip-Bildung ist die einzige
  teure Rechnung; der Deckel verhindert, dass ein Skript sie im Kreis
  anstößt.
- Kosten je Marke: zwei Entwürfe + Gespräch ≈ wie ein Foundation-Kapitel.

### 2.12 Sicherheit (prüfbar)

1. **Reise-Regel ist die Export-Regel.** `renderBrandContextMarkdown`,
   `buildBrandContextJson` und das Bündel lesen NUR über
   `brandShareableSlotValues`; Gegenprobe im Test: eine Marke mit
   `a.competitors` = „ACME hat Schwäche X" — der String erscheint in KEINER
   Datei (wie G1).
2. `a.facts` reist nie roh; nur die in `p.facts` gewählten Einträge.
3. Downloads sind Besitzer-Routen, `private, no-store`; fremde Marke ⇒ 404.
4. Dateinamen aus `slug` (Allowlist `[a-z0-9-]`), `filename*` RFC 5987 mit
   ASCII-Rückfall; `:file` gegen eine feste Liste, kein Pfad.
5. SVGs kommen aus Katalog-Setzungen (kein Nutzer-SVG, kein Upload); Text
   in SVGs wird XML-escaped (Markenname ist Nutzereingabe!).
6. `brand.md`/`README.md`: Markdown aus Werten — Werte werden nicht als
   Markdown interpretiert (Zeilen mit `#`/`>` am Anfang escapen), damit ein
   Wert keine Überschrift „erzeugt".
7. Freischaltung nur Betreiber/Webhook; keine Kundenroute schreibt das Feld.
8. Beispiel-Kit ist statisch aus Code, ohne Konto-Daten.

### 2.13 Messung

`derivation.unlocked` (via) / `.locked`, `kit.viewed`, `kit.downloaded`
(file, zip), `step.completed` (drei Kapitel, Sekunden), Zeit
Freischaltung → erster Download, Anteil Design-fertiger Marken mit
Token-Download, Anteil Foundation-only-Marken mit `brand.md`-Download
(= Beleg für §1.11 d „Design keine Voraussetzung"). **H5-Beweis** als
Skript `verify-brand-context.mjs`: ein Modell schreibt NUR mit `brand.md`
einen Absatz, der Dokument-Check (`brandCheckDocument`) bewertet ihn —
Erwartung „im Ton" über der Schwelle, Gegenprobe mit fremdem `brand.md`
darunter.

### 2.14 Copy und Marketing (Folge von §1.11 e/f)

- Startseite: `art1Body` „24 Kapitel …" → „Das vollständige Handbuch —
  Regel-Kapitel, Do & Don't, AI-Guidelines" (de/en); `art5`/`art6`
  (Content-Kompass, 90-Tage-Plan) bekommen das Etikett „Brand Experience";
  `art2Body` nennt `brand.md` neben `brand.json`.
- Team-Seite: `flow3Body` ohne „Rex" — „Produktion macht das Entschiedene
  versandfertig: Brand Book, Tokens, brand.md, brand.json, Pressekit — nichts
  Neues, alles benutzbar."
- Rail-Text Produkt 03: „Book, Tokens, brand.md + brand.json." (ohne
  „Strategy Playbook"); Produkt 04 bekommt Kompass + Plan genannt.
- FAQ-Satz „bezahlt wird erst die Ableitung: Design, Brand Book, Kit" bleibt.
- Keine neuen Config-Schlüssel; `check:i18n-keys` unverändert grün.

### 2.15 Prototyp (Phase 3, nach Freigabe) — ein Screen je Interaktionstyp

Im Playground mit Kailua: (1) Lieferseite `/brand/:id/kit` voll (alle
Kacheln, Bündel-Knopf, Stand); (2) dieselbe Seite OHNE Design-Preset
(Sperrflächen); (3) Leseansicht mit den drei Anwendungs-Kapiteln + aktiver
Export-Karte; (4) `aiguide` in der Werkstatt (Nika: `n.scope`-Karten,
`n.guardrails`-Bühne, `n.prompts` zum Kopieren); (5) `nomenclature` (Otto:
Typen-Chips, Muster-Bühne); (6) `presskit` mit Fakten-Freigabe; (7) Rail
mit gesperrter/offener Schicht 3 + Betreiber-Seite mit zwei Spalten;
(8) Kailua-Anatomie mit „Das Kit".

### 2.16 Nicht-Ziele (diese Fassung)

PNG-Raster der Zeichen (kein Rasterer im Haus außer dem og-Atlas) · Figma-
Plugin oder -Datei · MCP/API („Connect", Phase 3+) · DAM, Vorlagen-Editor,
Social-Template-Set · Server-PDF · Schriftdateien im Bündel · Content-Kompass
und 90-Tage-Plan (Produkt 04) · Brand Extract (eigener Baustein danach) ·
Stripe-Checkout selbst (BS1 Z1) · Änderung am Snapshot-Format (bleibt v2).

### 2.17 Abhängigkeiten und Fallen

- **Kapitel-Ids und Anker sind Verträge:** verschickte Tieflinks dürfen nicht
  ins Leere zeigen — nur anhängen, nie umbenennen; `ki-texte` bleibt.
- **Vier Leser der Registry** (Rail, Dokument, Leseansicht, Fortschritts-
  Cache) + Impact-Hinweis: dieselbe Klemme wie in D0, diesmal für Schicht 3
  — Klick-Beweis auf der Dokument-Seite, nicht nur Unit-Tests.
- **A14-Import** aus `themes/shared` bleibt auf `ramp.ts`/`oklch.ts` mit der
  bestehenden ESLint-Ausnahme; Namensschema von `customThemeCss` wird
  ÜBERNOMMEN, nicht importiert (themes bleibt unverändert).
- **DTCG-Farbobjekte:** `components` sind 0–1-Fließkommazahlen aus dem Hex —
  Rundung auf 4 Stellen, `hex` als Rückfall (Style-Dictionary-5.4-Weg).
- **`fflate` ins pnpm-Catalog**, `check:single-copy` grün.
- **Migration vor Deploy** (brand-025), Schema-Parität `branding` eintragen.
- **Beta-Regel liest `brand_access`:** die Lieferseite braucht denselben
  Zugriffspfad wie die Werkstatt; ein zweiter Leser der Beta-Wahrheit wäre
  ein Leck — `resolveDerivationAccess` bekommt die Tatsache übergeben,
  ermittelt sie nicht selbst.
- **Zwei Sprachen:** Regel-Kapitel und `brand.md` sind in `contentLocale`;
  Dateinamen und Token-Namen sind sprachneutral (`motion.fast`-Regel).

### 2.18 Pakete (VERBINDLICH seit Prototyp-Freigabe 2026-09-09)

| Paket | Inhalt | Gate (David) | Beweis |
| --- | --- | --- | --- |
| **K0 Gerüst** | `BRAND_KIT_STEP_KEYS`, drei Steps + Sessions in der Registry (Ziele/Leitern als Entwurf), Berater-Zuordnung, Journey `derivation_locked`, Rail-Layer 3 gesperrt, Kapitel-Ids + Titel de/en | — | Registry-Wächter, 4-Leser-Klemme, Klick auf Dokument-Seite |
| **K1 Freischaltung** | brand-025, `resolveDerivationAccess`, Admin-Routen + Seite `/dashboard/brand-unlocks` (zwei Spalten), Ereignisse, Marktvergleich liest die Regel | — | verify: frei/beta/gesperrt, 401/403 fremd, Rücknahme; Migration auf Prod mit Davids Ja |
| **K2 Token-Modell** | `buildBrandTokens` (DTCG), `renderBrandTokensCss`, Lizenz-Felder, `LICENSES.md`, Routen für die vier Dateien | — | Unit: Zod gegen DTCG-Form, Deckungsgleichheit CSS↔JSON, Kailua-Fixture; Style-Dictionary-v5-Probelauf im Skript |
| **K3 Brand Context** | `renderBrandContextMarkdown`, `buildBrandContextJson`, Routen, Kopieren-Knopf | Davids Blick auf Kailuas `brand.md` | Reise-Regel-Gegenprobe (Wettbewerber-String nirgends), H5-Skript |
| **K4 Book-Kapitel** | fünf Anker, Block-Arten `table`/`rules`/`prompt`/`contact`, Renderer, Leseansicht + Print, Share liest mit | Davids Blick auf die Leseansicht | Playwright: Anker stabil, Print-Snapshot, `locked`-Zustände ohne Freischaltung/ohne Preset |
| **K5 Werkstatt-Kapitel** | `nomenclature` (Otto), `aiguide` (Nika), `presskit` (Fakten-Freigabe, Kontakt) — Prompts, Formverträge, Eimer, Invarianten | **Davids Inhalts-Gate:** Ottos/Nikas Leitern + Katalog-Karten (`m.types`, `n.scope`, `n.review`) | 672+ brand-Tests, Live-Persona-Audit an Kailua + zwei Testmarken |
| **K6 Lieferseite + Bündel** | `/brand/:id/kit`, Manifest-Route, `marks/*.svg`, Zip (`fflate`), Download-Eimer, Export-Karte echt | Davids Blick auf die Seite | Playwright: jeder Download 200/`no-store`, 409 ohne Preset, 413-Deckel, fremd 404 |
| **K7 Beispiel + Copy** | Kailua-Kit öffentlich (Anatomie-Abschnitt, Beispiel-Routen), Startseiten-/Team-/Rail-Copy (§2.14) | Davids Wort zur Copy | `check:i18n-keys`, Live-Klick auf Discover |
| **K8 Audit + Live** | Code-Audit (Sicherheit §2.12), Live-Beweise auf branding.supply, COMPLETE-Eintrag mit Gelernt | Abnahme | Audit-Bericht, Live-Build-SHA |

Reihenfolge K0 → K1 → K2 → K3 → K4 → K5 → K6 → K7 → K8; K2/K3 sind pur und
können parallel zu K1 laufen. Pakete starten selbstständig, sobald das
vorige grün ist (Regel vom 2026-09-05); Inhalts-Gates blockieren nur das
jeweilige Paket.

**Stand K0 (GEBAUT 2026-09-09, main f4fa7a4a):** Registry mit
`BRAND_KIT_STEP_KEYS` + zehn Sessions, Ausnahme-Vertrag `p.facts` namentlich
genagelt, Kataloge `brandKitVocab.ts`, Berater-Zuordnung, Journey-Faktum
`derivationUnlocked` mit Grund `derivation_locked` (skipped, nicht locked),
Schicht-Schnitt wie Schicht 2 (Foundation-`result` done; Design keine
Voraussetzung), Rail-Layer 3 gesperrt, fünf Kapitel-Anker; alle vier Leser +
Impact-Hinweis geklemmt. Beweis: 2864 Tests (+40), Lint, Typecheck 0.
**Gelernt:** `nomenclature` gehört in `OPTIONAL_STEPS` (erbt W4), und
`canEnterBrandStep` muss den neuen Grund kennen, sonst sagt die Werkstatt
„übersprungen" statt „noch nicht geöffnet".

**Stand K1 (GEBAUT 2026-09-09, main e68586df; brand-025 mit Davids Ja auf
Prod gefahren, Spalten per Schema-Lesung bestätigt):** `resolveDerivationAccess`
(Beta ODER Feld; Beta-Wahrheit an EINER Stelle `brandAccountIsBeta`,
`profileFacts(row, betaAccount)` als Pflicht-Argument in 32 Routen),
Betreiber-Routen + Seite `/dashboard/brand-unlocks` (zwei Spalten, alte Route
301), Rail-Layer 3 offen nach Freischaltung, Sperrsatz ohne Preis,
Marktvergleich liest dieselbe Regel. **Beweis `verify:kit` 40/40 gegen Prod**
(mit Aufräumen; Davids Ja) — Kit-Kapitel antworten 403 `derivation_locked`
(nicht 404: der Sperrsatz braucht den Code). **Gelernt:** (1) es gibt KEINE
lokale Dev-Instanz für das Projekt `branding` — die einzige `branding.env`
liegt in der Prod-Ablage; ein Agent, der „irgendeine Env" sucht, findet
zuerst Prod (Lauf gestoppt und mit eindeutiger Env-Regel neu gestartet;
Verify-Läufe brauchen den Laufzeit-Key der Site, der Migrations-Key hat kein
`users.write`). (2) Zwei `nuxi dev` im selben App-Verzeichnis (Agent auf
3016, Prüfer auf 3017) reißen sich gegenseitig um: Verify erst, wenn der
Agent seinen Server beendet hat. (3) macOS hat kein `timeout` — ein
Verify-Aufruf mit `timeout 480 node …` läuft still ins Leere. (4) Ein
abgebrochener Verify-Lauf hinterlässt Testkonten auf Prod (`finally` läuft
beim Kill nicht) — vier Konten + 58 Zeilen von Hand entfernt, danach 0.

**Stand K2 (GEBAUT 2026-09-09, main fdcd95c6):** `buildBrandTokens` (DTCG
2025.10, Farbobjekte mit `components` + `hex`, hell/dunkel als Geschwister-
Gruppen, Rollen als Aliasse mit Kontrast-Beleg aus den Preset-Paaren,
Größen-Leiter geometrisch aus der Skala in rem, `radius.mark` mit Bezugs-
Kachel 2,5 rem), `renderBrandTokensCss` aus dem Token-Objekt (Deckungsgleichheit
33/33 Hex, jede Rolle in `:root`, `.dark`, `@theme`), Lizenz-Felder je
Schriftpaar + `LICENSES.md`, Datei-Registry `brandKitFiles`, Manifest- und
Datei-Route mit Download-Eimer `kitDay` 60/Tag, `verify:tokens` (Style
Dictionary 5 per `npx`, keine Dependency: 78 Variablen, keine Verweise).
**Nachschnitt §2.20 Nr. 7 eingebaut:** `color.dark.accent` → erste AA-fähige
Stufe der neuen Rampe `color.accent-dark` (von dunkel nach hell gesucht),
Beleg `$extensions["supply.branding/accent-lift"]` — Kailua: Original
2,03:1 auf `#0c0a09`, gehoben auf Stufe 300 `#879e90` mit 6,89:1. Beweis:
2927 Tests (+54), Lint, Typecheck 0. **Gelernt:** die Prototyp-Größen (42/32/
24/… px) hätten für jede zweite Marke gelogen — die Leiter muss aus der
gewählten Skala gerechnet werden; und das Preset trägt Gewicht/Laufweite nur
als Textzeilen, ohne Rückweg (`brandTypeRulesFromLines`) fielen die Tokens
still auf den D4-Vorschlag.

**Stand K3 (GEBAUT 2026-09-09, main 2a170767; Davids Blick auf Kailuas
`brand.md` offen):** `renderBrandContextMarkdown` (Aufbau §2.6 Nr. 1–8, 88
Zeilen für Kailua, Werte Markdown-escaped, Beschriftungen als bewachte Kopie
des Locale-Katalogs de/en mit Test), `buildBrandContextJson` (schemaVersion 1,
jedes Kapitel der Ansicht, Preset ohne Entwürfe), `renderBrandKitReadme`;
die Erzeuger sehen NUR die fertige `BrandFoundationView` — Gegenprobe:
`a.competitors`/`a.facts`/`a.complaints` stehen in keiner der drei Dateien.
`verify:context` (H5) als Dry-Run; der echte Lauf braucht den KI-Schlüssel.
Beweis: 2956 Tests (+29), Lint, Typecheck 0, SSR 404 ohne Login.
**Gelernt:** (1) `check:bilanz` (Produkt-Bilanz) ist Teil von CI-Lint — neue
Routen/Seiten ⇒ `pnpm bilanz` vor dem Push, sonst rot (K1/K2 hatten es
vergessen). (2) Der Dokument-Check-Judge fragt nach der Vollständigkeit
eines Fundaments, nicht nach dem Ton eines Absatzes — der H5-Beweis braucht
einen eigenen kurzen Richter-Prompt. Offen für K6: ohne Preset trägt
`context.stand` kein Datum (Design-Stand), ein Foundation-Stand je Datei
gehört zur Lieferseite.

**Stand K4 (GEBAUT 2026-09-09):** die fünf Anker haben Blöcke — `nomenklatur`
(Typen als Chips, Muster je Typ als Tabelle, Regeln), die drei
Anwendungs-Kapitel aus dem Preset, `pressekit` (Tagline, Boilerplates, NUR
`p.facts`, Kontakt) und `ki-texte`, das nach Abnahme von `aiguide` „AI-Guidelines"
heisst (Anker unverändert). Vier neue Block-Arten (`rules` mit optionalem
Gegenbeispiel, `prompt` mit Kopieren-Knopf, `contact`, `lockedUsage`; `table` gab
es schon). Die Zahlen sind DIE VON K2 — `brandTokenRoleHex` für die gespiegelten
Dunkel-Stufen, `BRAND_TOKEN_TYPE_STEPS` für die Größen-Leiter, der neue
`brandTokenAccentLiftFor` für den gehobenen Dunkelmodus-Akzent samt Beleg (§2.20
Nr. 7). Server: EINE Lade-Funktion für Book und Kit
(`server/utils/brandFoundationView.ts`) — der K3-Unterschied „Route überspringt
Schicht 3, Kit nicht" ist damit weg. Beweis: 2987 Tests (+31), Lint, Typecheck 0,
`check:i18n-keys`, `check:bilanz`; SSR ohne Login 404 auf `/de/brand/x/foundation`,
Playground-Dummy weiter 200. **Gelernt:** (1) `formatBrandSlotStructured` zieht
JEDEN Block auf EINE Zeile — ein `structured`-Wert mit Zeilenumbrüchen kommt vom
kanonischen Schreiber nie; wer Muster + Beispiel oder eine Prompt-Vorlage
speichert, braucht einen eigenen Trenner (` · `) oder baut den Wert selbst.
(2) Der Renderer darf Sätze in der INHALTSSPRACHE der Marke erzeugen (Schutzraum,
„nie Text auf …") — das ist kein Bruch der Schlüssel-Regel, sondern dieselbe
Trennung, die `mark.brief` und `type.rules` im Preset schon leben; nur der RAHMEN
reist als Schlüssel. (3) Ein Snapshot weiss nichts über die heutige
Freischaltung: `derivationUnlocked` ist deshalb DREIWERTIG (`true`/`false`/fehlt),
sonst stünden im Handbuch einer fremden Marke drei Kapitel Werbung.

**Stand K5 (GEBAUT 2026-09-09, main d215b420; Inhalts-Gate von David FREIGEGEBEN
2026-09-09 — Regel-Blöcke, Karten-Beispielzeilen, drei Abweichungen der
Einstiegssätze, Rolle „Inhaber/in" und die zwei `m.rules`-Setzungen, alle
wie vorgeschlagen):** die drei
Werkstatt-Kapitel laufen. Kataloge als Chips/Karten (`m.types` Mehrfachwahl,
`n.scope`/`n.review` mit geschlossenem Vertrag in `brandChoiceOptions.ts`,
`p.facts` Opt-in über die Einträge von `a.facts`, Default keiner; `p.contact`
mit Vorlage-Karten Konto-Inhaber/Erstgespräch, gespeichert wird der bestätigte
TEXT, Telefon nie). Otto (`m.patterns`) und Nika (`n.guardrails`) gehen über
den bestehenden Wizard-Weg (`generate.post.ts`: Bereitschafts-Gate 409
`not_ready`, Slot-Eimer, Dev-Stub, ZDR in `streamAdvisorTurn`) — Registrierung
in `server/plugins/otto-nomenclature.ts`/`nika-aiguide.ts`, pure Prompt-
Zusätze `ottoPrompt.ts`/`nikaPrompt.ts`, Zod-Formverträge in
`schemas/brandKitSlots.ts`, Invarianten als `verify` (Typ ohne Muster,
doppeltes Muster, fremder Typ, Tabu-Wort im Ton ⇒ ruhige RÜCKFRAGE statt
stillem Entwurf). `m.rules` pur vorbefüllt, `n.prompts` pur (System-Prompt =
`renderBrandContextSystemPrompt`, Kurzform aus dem K3-Renderer, keine zweite
Fassung der Sätze), `p.summary` pur; die puren Quellen liefert EINE Besitzer-
Route `GET …/kit/workshop` (`private, no-store`, Datentür von K1: fremd 404,
ohne Freischaltung 403). Schreiber UND K4-Leser gehen durch dieselben Helfer
in `shared/brandKitSlots.ts`; die Muster-Tabelle im Book trägt jetzt eine
vierte Spalte „Herkunft". Beweis: 3117 Tests (+51), Lint, Typecheck 0,
`check:i18n-keys`, `check:bilanz`, `check:manifests`. **LIVE seit 2026-09-10**
(Build `b976197d`, ein späterer Commit mit K5 als Vorfahr — der eigene SHA
`d215b420` erschien nie am Health-Endpunkt, weil Nachbarsitzungen weiter
pushten und der Deploy den jüngeren Stand baute): die neue Route antwortet
ohne Login 404 mit dem DATENTÜR-Envelope (`{"ok":false,"code":"NOT_FOUND",
"message":"Not Found"}`, wortgleich mit der bekannten K2-Route
`kit/tokens.json`), während eine wirklich unbekannte Route Nitros eigenes
404 mit Pfad im Text liefert — die Route ist also ausgeliefert und die
Datentür greift. NICHT bewiesen:
Otto/Nika gegen ein echtes Modell, die drei neuen Zusagen 31–33 in
`verify-brand-sessions.mjs` (geschrieben, nie gefahren — braucht Davids Ja zu
einem Lauf gegen Prod mit Aufräumen), Klick-Beweis in der Werkstatt.
**Gelernt:** (1) die Werkstatt hat kein Mehrfach-Chips-Instrument (`BwChips`
gehört der Abnahme-Fläche, das Bühnen-Modul fällt sonst auf ein Textfeld) —
`m.types` und `p.facts` brauchten eigene Panels. (2) Die Registry-
Bereitschaftsregel sperrt erst, wenn ALLE Quellen leer sind; bei sechs
Quellen kommt so immer ein bezahlter Lauf zustande — Schicht 3 braucht die
STRUKTUR-Quelle als eigenen Bedarf (`name_types`, `tone_words`), mit
`coveredSteps`-Klammer, sonst sperrt die Werkstatt clientseitig immer.
(3) `sessionInstruction` wirft für eine Session ohne `rules` — K0 hatte für
die zwei Generator-Sessions Ziele und Leitern, aber keine Verarbeitungs-
regeln; die stehen jetzt drin und sind Teil des Inhalts-Gates. (4)
`brandChoiceContract` hält genau EINE Id — ein `list`-Slot wie `m.types`
passt nicht hinein, Mehrfachwahl braucht ihre eigene Klemmung. (5) Statische
Route schlägt Parameter-Route (`kit/workshop` neben `kit/[file]`) — im Repo
an sieben Stellen im Betrieb belegt (`check/ranking` neben `check/[id]`),
kein Messlauf nötig; auf Prod bleibt die Vorrangfrage
mangels Login unentschieden, weil beide Routen ohne Konto dasselbe 404
zeigen. Offen: der Live-Persona-Audit (Kailua + zwei
Testmarken) aus der Beweis-Spalte ist NICHT Teil von K5 geworden — er gehört
zu K8 (Audit + Live), wenn die Lieferseite steht.

**Stand K6 (GEBAUT 2026-09-09, main 2a4f6a26; Davids Blick auf die Seite
offen — der Screenshot liegt ihm vor):** die Lieferung steht.
`renderBrandMarkFiles` macht aus den acht Setzungen des Presets acht Dateien
`marks/<slug>-<setting>-<variant>.svg` (Markenname XML-escaped, Dateiname nur
`[a-z0-9-]`) — KEINE zweite Ableitung, die SVG-Quelltexte stehen fertig im
Preset. `buildBrandKitZip` packt in-memory über `fflate` (Level 6,
Zeitstempel = Stand, also zwei Läufe byte-gleich), Deckel 5 MB als pure Regel
`decideBrandKitZipSize` ⇒ 413 `kit_too_large`. Die zwei neuen Routen (`kit.zip`,
`kit/marks/:name`) stehen hinter denselben vier Türen wie die Datei-Route
(404 → 403 `derivation_locked` → 429 `brand_kit_limit` → 409), das Bündel
zählt fünffach. `brandKitStand` ist das jüngste `$updatedAt` ALLER Kapitel —
damit trägt das Kit auch ohne Preset ein Datum (der K3-Rest ist erledigt). Das
Manifest trägt jetzt `marks`, `bundle`, `chapters`, Foundation- und
Design-Stand und die Inhaltssprache. Die Seite `/brand/:id/kit` folgt der
freigegebenen Prototyp-Optik; ohne Preset zeigen Tokens, Zeichen und Lizenzen
die ruhige Sperr-Fläche `BwKitLocked` mit Erstgespräch, ohne Preis. Rail-
Ergebnispunkt „Kit" und die Export-Karte der Leseansicht sind echt (Klick-
Beweis: das Assets-Untermenü führt auf `…/kit.zip` und auf die Lieferseite).
Beweis: 3181 Tests (+37), Lint, Typecheck 0, `check:i18n-keys`,
`check:single-copy`, `check:manifests`, `check:bilanz`, **`verify:kit` 58/58**
(Abschnitt 9 „Die Lieferung" ist neu und prüft Manifest, sechs Dateien mit
`private, no-store`, acht Zeichen, ein gültiges Zip mit README und `marks/`,
409 ohne Preset, 404 fremd, 403 gesperrt, 429 nach zwölf Bündeln und die
SSR-Seite mit und ohne Anmeldung).
**Gelernt:** (1) ES GIBT JETZT DOCH EINE LOKALE DEV-INSTANZ für `branding` —
die K1-Lehre „nur Prod" galt, weil das Projekt lokal fehlte, nicht weil es
nicht ginge: der Console-Signup der OrbStack-Appwrite ist offen
(`_APP_CONSOLE_WHITELIST_*` leer), also Konto → Team → Projekt `branding` →
Projekt-Key → `POST /v1/tablesdb` für `main` → `pnpm migrate --app branding`,
und `verify:kit` läuft ohne ein einziges Prod-Konto. (2) DER GRUND MUSS DER
CODE SEIN: der zentrale Handler hebt aus `error.data` genau `code` ins
Envelope — das seit K2 danebenstehende `reason: 'design_missing'` kam beim
Client NIE an (dieselbe tote Hälfte wie `last_admin` vor dem 2026-07-29). Die
Gründe heissen jetzt selbst `kit_file_design_missing` /
`kit_file_not_built_yet`; ein Unit-Test nagelt fest, dass daneben nichts
steht. Gefunden hat es der Verify-Lauf, nicht der Unit-Test — der prüfte
`error.data.code` und sah die Envelope-Grenze naturgemäss nicht. (3) DER
STAND IM KOPF UND DER STAND IM DATEINAMEN SIND DERSELBE TAG: der Stempel
schneidet den Kalendertag in UTC, die Anzeige formatierte den Zeitpunkt in der
Zone des Lesers — abends stand „9. September" über einem Bündel namens
`…-2026-09-10.zip`. Jetzt liest die Anzeige den Stempel. (4) Zeichen mit
verschiedenen Seitenverhältnissen (Wortmarke 400×120, Monogramm 160×120)
brauchen eine feste Bühne, in die sie HINEINPASSEN — auf volle Breite gezogen
stand jede Beschriftung auf einer anderen Linie und das Raster sah aus wie ein
Fehler.

### 2.19 Offene Entscheidungen für die Freigabe

| # | Frage | Empfehlung |
| --- | --- | --- |
| 1 | Hell/Dunkel in `tokens.json`: Geschwister-Gruppen `color.light.*`/`color.dark.*` in EINER Datei — oder zwei Dateien `tokens.light.json`/`tokens.dark.json`? | **eine Datei mit Gruppen** — ein Download, Aliasse in dieselben Rampen; Figma/Style Dictionary bilden Gruppen auf Modi/Sets ab |
| 2 | Lieferseite `/brand/:id/kit` als eigene Seite (Supply) — oder als viertes Werkstatt-Kapitel `kit` mit Bestätigung „Stand freigeben"? | **eigene Seite**, nichts wird entschieden; ein Kapitel „freigeben" wäre eine gespeicherte Fassung und widerspräche „gerechnet, nie gespeichert" |
| 3 | Presse-Kontakt (`p.contact`) als neue Frage — oder weglassen (Pressekit ohne Ansprechperson)? | **fragen, optional** — Brandkit-Regel 5 „Ansprechperson" (BF1 Anhang A); reist by design |
| 4 | Nomenklatur nur auf dem B2-Weg (Untermarken) — oder immer (auch ohne Architektur, für Produkt-/Angebotsnamen)? | **nur auf dem B2-Weg** — ohne Architektur gibt es kein Muster, das zu bestätigen wäre; Solo-Marken bekommen den Namensteil in `n.guardrails` (Schreibweisen) |
| 5 | Betreiber-Seite: `/dashboard/brand-design` in `/dashboard/brand-unlocks` mit zwei Spalten überführen — oder zweite Seite daneben? | **eine Seite, zwei Spalten**, alte Route leitet weiter |
| 6 | Kapitel-Namen (de/en): Nomenklatur · AI-Guidelines · Pressekit · Zeichen-Anwendung · Farb-Anwendung · Typografie-Anwendung; Kapitel 11 heißt nach Abnahme „AI-Guidelines" statt „Regeln für KI-Texte"? | so — Ids bleiben, Anker `ki-texte` bleibt |

### 2.20 Entscheidungen zur Konzeption (David, 2026-09-09, Fragenrunde)

§2.19 bleibt als Protokoll stehen.

| # | Frage | Entscheidung | Einordnung |
| --- | --- | --- | --- |
| 1 | Token-Modi | **Eine `tokens.json`, Geschwister-Gruppen `color.light.*` / `color.dark.*`** | nach Empfehlung |
| 2 | Lieferseite | **Eigene Seite `/brand/:id/kit`**, nichts wird entschieden, nichts gespeichert | nach Empfehlung |
| 3 | Presse-Kontakt | **Fragen, optional — mit VORLAGE aus vorhandenen Ansprechpartner-Daten** (Konto-Inhaber, Erstgespräch-Anfrage) als wählbare Karten, die das Feld vorfüllen | Davids Zuschnitt (eingearbeitet in §2.4): der Punkt soll ein Klick sein, wenn es dieselben Daten sind. Leitplanke: gespeichert wird der bestätigte TEXT, kein Verweis — die Konto-Daten dürfen sich später ändern, ohne das Pressekit still mitzuändern; und der Mensch sieht vor der Abnahme, dass die Angabe öffentlich reist |
| 4 | Nomenklatur | **Nur auf dem B2-Weg** (`includeStep` wie `architecture`); Solo-Marken bekommen Schreibweisen in `n.guardrails` | nach Empfehlung |
| 5 | Betreiber-Seite | **`/dashboard/brand-unlocks` mit zwei Spalten** (Brand Design, Ableitung), alte Route leitet weiter | nach Empfehlung |
| 6 | Kapitel-Namen | **Wie vorgeschlagen** (de: Nomenklatur · AI-Guidelines · Pressekit · Zeichen-Anwendung · Farb-Anwendung · Typografie-Anwendung; en: Nomenclature · AI guidelines · Press kit · Mark usage · Colour usage · Type usage); Kapitel 11 zeigt nach Abnahme „AI-Guidelines", Id/Anker `ki-texte` bleibt | nach Empfehlung |

| 7 | Abnahme-Runde (2026-09-09): Dunkelmodus-Akzent unter AA (Kailua `accent` 1,8:1 auf dunkler Fläche) | **Automatisch heben** — `buildBrandTokens` (K2) gibt `color.dark.accent` einen eigenen Alias auf die erste Rampenstufe, die AA erreicht; das gemessene Urteil bleibt als `$extensions`-Beleg | nach Empfehlung (DECISION-LOG, Nachtrag) |

Damit sind alle Konzept-Fragen beantwortet. **Die Freigabe des Konzepts und
der Start des Prototyps (§2.15) sind Davids ausgesprochenes Go** (WORKFLOW
„Freigaben sind explizit") — bis dahin kein Code.

---

## 3. Prototyp (Phase 3) — gebaut 2026-09-09, FREIGEGEBEN 2026-09-09 (eingefroren)

Klickdummy im Playground (`packages/brand/.playground`, Port 3009; im
Browser-Fenster über den Launch-Eintrag `brand-gespraech` auf 3031), acht
Screens nach §2.15 mit Kailua Coffee Co., gebaut von einem Opus-Lauf nach
Brief, geprüft von Fable (Lint, Typen, SSR, Konsole, Sichtprüfung je Screen):

| # | Route | Zeigt |
| --- | --- | --- |
| 1 | `/brand/demo/kit` | Lieferseite: Bündel-Knopf mit Dateiname und Stand, Brand Context (`brand.md` gerendert + Kopieren/Laden, `brand.json` aufklappbar), Design-Tokens (Rampen hell/dunkel ECHT gerechnet, Rollen je Modus mit Hex und Kontrast-Urteil, `tokens.json`/`tokens.css` als Code), Zeichen in drei Varianten, Pressekit, Lizenzen, README-Zeile; rechts „Korrigieren" mit dem Weg in die Kapitel und der Reise-Regel-Erklärung |
| 2 | `/brand/demo/kit?design=none` | dieselbe Seite ohne Preset: Tokens, Zeichen, Lizenzen als ruhige Sperr-Fläche „Kommt mit Brand Design" + Erstgespräch-CTA, kein Preis; Bündel-Zeile „drei Kacheln fehlen" |
| 3 | `/brand/demo/foundation?design=done&kit=done` | Leseansicht mit 16 Kapiteln: Nomenklatur (04), Zeichen-/Farb-/Typografie-Anwendung (11–13), Pressekit (14), AI-Guidelines (15, Anker `ki-texte`); Export-Menü mit echten Untermenüs |
| 4 | `/brand/demo/kit/aiguide` | Nika: `n.scope` (vier Karten), `n.review` (drei), `n.guardrails` (Entwurf in vier Gruppen mit Herkunft je Zeile, „Das halte ich fest"/„Korrigieren"), `n.prompts` (drei Vorlagen, pur, Kopieren) |
| 5 | `/brand/demo/kit/nomenclature` | Otto: `m.types` (Chips, Mehrfachwahl), `m.patterns` (je Typ ein Muster mit Herkunft und Beispiel), `m.rules` (fünf Regeln zum Abhaken); Hinweis „nur auf dem Weg mit Markenarchitektur" |
| 6 | `/brand/demo/kit/presskit` | George: `p.facts` (fünf Fakten, Opt-in je Eintrag, Default keiner), `p.contact` mit den drei Vorlage-Karten (§2.20 Nr. 3), `p.summary` |
| 7 | `/brand/demo/kit/unlock` | Betreiber „Freischaltungen": UTable mit zwei Spalten (Brand Design · Ableitung), Bestätigung, Chip „Frei seit … · via operator/beta", Ereigniszeile |
| 8 | `/brand/demo/anatomie?kit=1` | Kailua-Anatomie mit Abschnitt „Das Kit" (vier Kacheln, „Ganzes Kit ansehen") |
| + | `/brand/demo/foundation?design=done` | Gegenprobe ohne Freischaltung: Anwendungs-Kapitel mit Schloss im Inhaltsverzeichnis, Kapitel 11 heißt weiter „Regeln für KI-Texte" |

Bausteine: `utils/demoKit.ts` (Daten + pure Rechnungen `demoTokensJson`,
`demoTokensCss`, `demoBrandMd`, `demoBrandJson`, Kapitel-Bauer),
`FdKitWorkspace.vue` (Hülle Schicht 3 mit Berater je Kapitel), `FdKitMark.vue`,
`FdKitLocked.vue`, drei neue Block-Arten `rules`/`prompt`/`contact` in
`FdChapter.vue`, `demoRailWithKit()`; Rail-Layer „Brand Book & Kit" auf die
BK1-Copy gezogen (kein „Templates", kein „Strategy Playbook").

**Beweise:** Lint grün (`pnpm --filter @pukalani/brand lint`); `tsc --strict`
über `demoKit.ts` ohne Befund (der Worktree-Typecheck meldet 13 723
vorbestehende Auto-Import-Fehler, keiner in den neuen Dateien — dieselbe
Klemme wie BD1 D0); alle neun Routen SSR 200, 0 Konsolenfehler bei 1440×2400
(Playwright-Skript im Scratchpad); Token-Deckungsgleichheit: 34 Hex in
`tokens.css`, 0 fehlen in `tokens.json`, jede Rolle in beiden Modi und beiden
CSS-Blöcken; `brand.md` 69 Zeilen, ohne Design 65.

**Abweichungen vom Brief, im Bau entschieden:** (1) die neuen Kapitel-Bauer
liegen in `demoKit.ts`, nicht in `demoFoundation.ts` (sonst Zirkel
demoFoundation → demoKit → demoFoundation); (2) zwei Hilfs-Komponenten mehr
(Sperr-Fläche dreimal, Zeichen sechsmal auf der Seite); (3) die Anwendungs-
Kapitel erscheinen erst ab `?design=` ungleich `locked` — auf der unberührten
BF1-Ansicht sagt Kapitel 10 die Schranke schon; (4) Kailua steht im Dummy auf
dem Architektur-Weg (zweiter Ausschank, Abo-Programm), damit das Kapitel
zeigbar ist — die Hinweis-Zeile nennt das; (5) Rampen-/Rollen-Tabellen der
Lieferseite handgebaut (Farbflächen in echter Markenfarbe), `UTable` bei
Lizenzen und Freischaltungen.

**Fables Sichtbefunde, vor der Vorlage behoben:** Kontrast-Chip „nur große
Schrift" überlagerte in der Zweier-Reihe den Rollen-Namen ⇒ drei Spalten
(Name/Hex übereinander, Urteil `auto`, `whitespace-nowrap`) und Kurzform
„AA groß"; die Freischaltungs-Tabelle lief bei 1440 px aus der Karte ⇒
Spaltenkopf „Ableitung" kurz, Marken-Zelle `max-w-[22rem]` mit Umbruch.

Nächster Schritt: Davids Abnahme am lebenden Objekt (Korrekturen direkt am
Dummy), dann Pakete K0–K8 (§2.18).

---

## Anhang A — Recherche-Quellen (2026-09-08)

| Quelle | Sorte | Kernaussage für uns |
| --- | --- | --- |
| [w3.org/community/design-tokens — „first stable version" (2025-10-28)](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) · [designtokens.org/tr/drafts/format](https://www.designtokens.org/tr/drafts/format/) | Token-Standard | DTCG Format 2025.10 ist die erste stabile Fassung; 40+ Organisationen (Adobe, Figma, Google, Microsoft, Shopify, Salesforce); Theming, moderne Farbräume, Cross-Tool |
| [styledictionary.com/info/dtcg](https://styledictionary.com/info/dtcg/) · [style-dictionary Issue #1590](https://github.com/style-dictionary/style-dictionary/issues/1590) · [Releases](https://github.com/style-dictionary/style-dictionary/releases) | Token-Werkzeug | v5 liest DTCG als Default; 5.4.0 unterstützt 2025.10-Dimensionsobjekte und Hex-Fallback für Farbobjekte |
| [misha.wtf — DTCG Design Tokens in Figma](https://www.misha.wtf/blog/figma-dtcg-design-tokens) · [forum.figma.com — DTCG composite export](https://forum.figma.com/suggest-a-feature-11/dtcg-composite-token-export-support-51314) | Figma | Nativer Variablen-Export/-Import als DTCG-JSON (Schema 2025); zusammengesetzte Tokens (Typografie, Schatten) noch nicht; `description` fehlt im Export |
| [tailwindcss.com/blog/tailwindcss-v4](https://tailwindcss.com/blog/tailwindcss-v4) | CSS-Framework | Tokens CSS-first im `@theme`-Block (`--color-*`, `--font-*`), zur Laufzeit als CSS-Variablen verfügbar |
| [frontify.com/en/blog/frontify-mcp](https://www.frontify.com/en/blog/frontify-mcp) · [frontify.com/en/ai](https://www.frontify.com/en/ai) · [getmasset.com — Frontify MCP (Beta)](https://www.getmasset.com/resources/blog/frontify-mcp-server) | Container (Enterprise) | „Brand intelligence… readable by AI"; MCP-Server verbindet Claude/ChatGPT mit Live-Guidelines; Brand Assistant beantwortet Fragen aus den Guidelines; Preis per Demo |
| [corebook.io](https://www.corebook.io/) · [corebook.io/price/brand-owners](https://www.corebook.io/price/brand-owners) · [matchstic — AI-Ready Brand Guidelines Software 2026](https://learn.matchstic.com/ai-ready-brand-guidelines-software-the-2026-rankings) | Container (KMU/Agentur) | Corebook° AI erzeugt Guideline-Module, Figma-Sync, MCP für Agenten; ab 99 $/Monat (Brand Owners); Ranking: „keine maschinenlesbare Auslieferung außerhalb der Plattform" |
| [standards.site/for-agencies](https://standards.site/for-agencies/) · [overmatter.design — 10 Plattformen](https://www.overmatter.design/blog/best-brand-guidelines-software-compare-10-platforms-for-designers-agencies) | Container (Agentur) | SVG-Logo hochladen → Farbvarianten automatisch; Custom Domain; Pentagram/Gretel; Pro/Enterprise, oberes Mittelfeld |
| [bynder.com — AI Control Center](https://support.bynder.com/hc/en-us/articles/36132580207506-AI-Control-Center-Setting-up-Global-AI-Instructions-and-more) · [bynder.com — AI compliance agent](https://www.bynder.com/en/press-media/bynder-expands-ai-agent-capabilities/) · [cloudcampaign.com — AI Brand Guidelines 2026](https://www.cloudcampaign.com/blog/ai-brand-guidelines) · [monigle.com — guidelines into AI-ready systems](https://www.monigle.com/blog/converting-brand-guidelines-into-ai-ready-systems/) | DAM + Ratgeber | AI-Guidelines als Kernbestandteil: Guardrails, Freigabe-Workflow, Tabus/No-go-Zonen, Markenzeichen-Schreibweisen, Mensch entscheidet zuletzt; „Global AI Instructions" als Produktfeature |
| [businesswire — Canva in AI-Assistenten (2026-02-05)](https://www.businesswire.com/news/home/20260205384226/en/Canva-Brings-On-Brand-Designs-Directly-into-AI-Assistants) · [canva.com/help/brand-voice](https://www.canva.com/help/brand-voice/) · [canva.com/help/brand-kit-builder](https://www.canva.com/help/brand-kit-builder/) | Generator/Container | Brand Kit in ChatGPT (Feb 2026) und Gemini (Mai 2026); „Brand Voice" = 500 Zeichen + 3–5 Textproben, nur Pro/Teams; Brand Kit Builder aus Website/PDF |
| [costbench.com — Looka Pricing 2026](https://costbench.com/software/ai-design-tools/looka/) · [checkthat.ai — Looka](https://checkthat.ai/brands/looka/pricing) | Generator (Abo) | Brand Kit 96 $/Jahr: Premium-Logodateien + 300+ Vorlagen + Guidelines-Dokument; mit Website 129 $/Jahr; Auto-Verlängerung |
| [llmstxt.org-Praxis: bluehost.com — What is llms.txt (2026)](https://www.bluehost.com/blog/what-is-llms-txt/) · [everything-pr.com — llms.txt and the Brand AI Crawl Layer](https://everything-pr.com/llms-txt-and-the-brand-ai-crawl-layer) · [bodkin.studio — Brand guidelines your agents can read](https://www.bodkin.studio/blog/brand-guidelines-your-agents-can-read) | Kontext-Dateien für KI | Markdown im Site-Root; Kurzbeschreibung im Blockquote als „System-Prompt"; Marken veröffentlichen ein kleines Kit für Maschinen; Guidelines als Markdown + Tokens für Agenten |
| lovable.dev Brand Kit Extractor (BF1 Anhang A) | Extraktor | URL → Farben (WCAG), Schriften, Voice, Tokens (JSON/CSS/Tailwind), PDF, `design.md` für KI-Agenten |
| Frontify-Guide, Corebook°, standards.site, Brandkit, brandingstyleguides.com, boston.gov, HubSpot (BF1 Anhang A) | Container/Galerien/Ratgeber | Kapitelmuster und Umfangs-Norm (20–39 Seiten) — s. docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md Anhang A |
| Looka/Tailor Brands/Brandmark-Preise (BS1 Anhang) | Preisformen | Einmalig je Marke ist etabliert (Looka-Logo, Brandmark); das PFLEGEN wird als Abo verkauft (Looka Brand Kit, Frontify) — s. docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §3.3 |
