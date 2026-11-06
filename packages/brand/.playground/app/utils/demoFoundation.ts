/**
 * KLICKDUMMY „BRAND FOUNDATION" (Phase 3 zum Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md, §2.11) — statische Demo-Daten
 * in der FORM des künftigen Renderer-Ergebnisses `BrandFoundationView`
 * (§2.1: eine Quelle, EIN Renderer, zwei Ansichten).
 *
 * Die echte Fassung entsteht später als pure Regel
 * `buildBrandFoundation(input)` in `packages/brand/shared/brandFoundation.ts`;
 * hier stehen dieselben Felder von Hand gefüllt, damit die Form beurteilt
 * werden kann, bevor sie gebaut wird.
 *
 * ZWEI DINGE, DIE DIESE DATEI ABSICHTLICH NICHT ENTHÄLT (§2.3):
 *  1. Rohantworten — Gründungsimpuls, Party-Persona, Branchen-Ärgernis. Sie
 *     sind Material für George, kein Handbuch-Inhalt (`audience: 'internal'`).
 *  2. Vertrauliches — Wettbewerber, Beschwerden, harte Fakten
 *     (`sensitivity: 'internal'`). Es reist weder per Link noch in den Druck.
 * Notizen, Befunde, Konfidenz und Chats fehlen aus demselben Grund.
 *
 * Marke: Kailua Coffee Co. — dieselbe Demo-Marke wie in
 * `pages/brand/demo/beispiel.vue`; die dortigen Texte sind wörtlich
 * übernommen und im selben Ton ergänzt.
 */

/** Ein Block ist die kleinste Darstellungs-Einheit eines Kapitels. */
export type FdBlock =
  /** EIN Leitsatz, groß gesetzt (Pitch, Purpose, Tagline, Zeile für die Wand). */
  | { kind: 'lead', text: string, label?: string, note?: string }
  /** Fließtext mit optionaler Beschriftung (Vision, Mission, Begründungen). */
  | { kind: 'text', text: string, label?: string }
  /** Aufzählung (Folgen der Positionierung, Tabu-Wörter). */
  | { kind: 'list', label?: string, items: string[] }
  /** Karten: Zielgruppen-Segmente, Werte (Definition + gelebtes Beispiel). */
  | { kind: 'cards', label?: string, items: { title: string, text: string, note?: string }[] }
  /**
   * Ton-Wörter als Chips — je Wort EINE Stimmprobe darunter (Boston.gov-
   * Muster, §1.5). Eine nackte Chip-Reihe sagt nichts darüber, wie das Wort
   * klingt.
   */
  | { kind: 'chips', label?: string, items: { word: string, sample: string }[] }
  /** Do & Don't als Paare (§2.4 — aus Wort-Leitfaden und Tabu-Wörtern). */
  | { kind: 'dodont', label?: string, pairs: { doText: string, dontText: string }[] }
  /** Tabelle (Namens-Kandidaten, Prüf-Tabelle, Rollen/Kontrast/Skala). */
  | { kind: 'table', label?: string, columns: string[], rows: string[][] }
  /**
   * DIE DREI BLOCK-ARTEN DER ANWENDUNGS-KAPITEL (Book & Kit, Konzept
   * docs/plans/BRAND-BOOK-KIT.md §2.5). Sie stehen hier bei den anderen und
   * nicht in `demoKit.ts`, weil ein Block-Typ dem RENDERER gehört
   * (`FdChapter.vue`) und nicht dem Kapitel, das ihn zuerst benutzt.
   */
  /** Nummerierte Regel-Liste mit optionalem Don’t darunter. */
  | { kind: 'rules', label?: string, items: { text: string, dont?: string }[] }
  /** Kopierbare Vorlage (Prompt) — Zweck oben, Text darunter, Vermerk unten. */
  | { kind: 'prompt', label?: string, title: string, text: string, note?: string }
  /** Ansprechperson, die BY DESIGN öffentlich reist (§2.4 `p.contact`). */
  | { kind: 'contact', label?: string, name: string, role: string, email: string, note?: string }
  /** Die sichtbare Schranke (§2.5): Element, ein Satz, das Produkt dahinter. */
  | { kind: 'locked', title: string, text: string, product: string }
  /** Farbrampe der gewählten Richtung (nur mit `?richtung=`). */
  | { kind: 'swatches', label?: string, items: { hex: string, name: string, role: string }[] }
  /**
   * Der FESTE Rahmen der KI-Regeln (§2.4): „Schreibt in diesem Ton · Vermeidet
   * · Steht für" — gefüllt aus Ton-Wörtern, Tabu-Wörtern und Werten. Keine
   * Generierung, kein Cache: so aktuell wie die Werte selbst.
   */
  | { kind: 'aiRules', tone: string[], avoid: string[], stands: string[], note?: string }

export interface FdChapterData {
  id: string
  /** Stabile Sprungmarke — trägt auch im geteilten Link (§1.5). */
  anchor: string
  title: string
  /** `pending` = noch nicht abgenommen (nur privat sichtbar), `locked` = Schranke. */
  state: 'done' | 'pending' | 'locked'
  /** Ein Satz unter der Überschrift (Herkunft, Vermerk). */
  note?: string
  blocks: FdBlock[]
}

export interface FdFoundation {
  brand: {
    title: string
    tagline: string
    archetype: string
    /** Inhaltssprache der Marke — die Werte sind EN, das Handbuch ist DE. */
    locale: string
    standDate: string
  }
  /** „Auf einer Seite" (§1.5, HubSpot-Muster) — kein eigenes Kapitel. */
  onePage: {
    purpose: string
    values: { word: string, line: string }[]
    archetype: string
    tagline: string
    wallLine: string
  }
  chapters: FdChapterData[]
}

/* Die Kailua-Palette — dieselben fünf Farben wie in beispiel.vue/ergebnis.vue. */
const KAILUA_PALETTE = [
  { hex: '#4a3123', name: 'Roast', role: 'Grund & Text' },
  { hex: '#b98a5e', name: 'Crema', role: 'Wärme & Flächen' },
  { hex: '#e8d3b8', name: 'Milk', role: 'Helle Flächen' },
  { hex: '#2f4a3a', name: 'Palm', role: 'Akzent & Signal' },
  { hex: '#f7f2ea', name: 'Paper', role: 'Papier & Ruhe' },
]

export const demoFoundation: FdFoundation = {
  brand: {
    title: 'Kailua Coffee Co.',
    tagline: 'One honest, quiet moment a day.',
    archetype: 'Der Weise · Rest Schöpfer',
    locale: 'EN',
    standDate: '5. September 2026',
  },

  onePage: {
    purpose: 'Es gibt uns, damit vielbeschäftigte Menschen auf Oʻahu einen ehrlichen, ruhigen Moment am Tag bekommen — eine Tasse, deren Anbau, Röstung und Ausschank Menschen mit Namen verantworten.',
    values: [
      { word: 'Klartext', line: 'Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt.' },
      { word: 'Handwerk', line: 'Lieber eine Röstung perfekt als fünf Sorten mittelmäßig.' },
      { word: 'Nähe', line: 'Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat.' },
    ],
    archetype: 'Der Weise mit einem Rest Schöpfer — ruhig, fundiert, gerade heraus.',
    tagline: 'One honest, quiet moment a day.',
    wallLine: 'Ein ehrlicher, ruhiger Moment am Tag.',
  },

  chapters: [
    // ── 0 Brand Story ────────────────────────────────────────────────────
    {
      id: 'story',
      anchor: 'story',
      title: 'Brand Story',
      state: 'done',
      note: 'Von George aus euren Antworten verdichtet — von euch freigegeben.',
      blocks: [
        {
          kind: 'lead',
          text: 'Bei einer Tomate steht die Herkunft auf dem Schild. Bei einer Tasse Kaffee steht dort ein Preis.',
        },
        {
          kind: 'text',
          text: 'Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Anbau, Röstung und Ausschank liegen in einer Hand — nicht als Effizienz-Idee, sondern weil sich sonst niemand mehr erinnert, wer welche Entscheidung getroffen hat. Wir rösten eine Sorte pro Saison. Was in der Kanne ist, hat einen Ort, einen Monat und einen Namen.',
        },
        {
          kind: 'text',
          text: 'Der Ausschank ist kein Verkaufsraum mit Kaffee darin, sondern eine Backstube mit Theke: Die Maschine steht sichtbar, die Herkunftstafel hängt auf Augenhöhe und wird jede Saison neu geschrieben. Wer fragt, bekommt eine Antwort und keine Broschüre.',
        },
        {
          kind: 'text',
          text: 'Was daraus folgt, gilt für alles Weitere: Wir wachsen über Wiederkehr, nicht über Sortenvielfalt. Und wir sagen lieber „die Ernte war klein, der Preis steigt" als gar nichts.',
        },
      ],
    },

    // ── 1 Kontext & Zielgruppe ───────────────────────────────────────────
    {
      id: 'kontext',
      anchor: 'kontext',
      title: 'Kontext & Zielgruppe',
      state: 'done',
      blocks: [
        {
          kind: 'lead',
          label: 'Wie wir uns erklären',
          text: 'Wir sind eine Rösterei mit Ausschank auf Oʻahu: eine Röstung pro Saison, Herkunft mit Namen, Preise ohne Sternchen. Wer bei uns Kaffee trinkt, weiß, was er in der Hand hält.',
        },
        {
          kind: 'text',
          label: 'Kategorie',
          text: 'Spezialitätenrösterei mit eigenem Ausschank, Kailua auf Oʻahu, Hawaii — gegründet 2026. Anbau, Röstung und Ausschank aus einer Hand.',
        },
        {
          kind: 'cards',
          label: 'Für wen wir da sind',
          items: [
            {
              title: 'Pendler mit Ritual',
              text: 'Kommen fünfmal die Woche vor der Arbeit, immer dasselbe. Sie kaufen keine Vielfalt, sie kaufen Verlässlichkeit.',
              note: 'Brauchen von uns: gleiche Qualität, gleiche Zeit, keine ständig neue Karte.',
            },
            {
              title: 'Nachbarschaft am Wochenende',
              text: 'Kommen zu zweit oder mit Kindern, bleiben eine Stunde, lesen die Herkunftstafel von vorn bis hinten.',
              note: 'Brauchen von uns: Platz, Ruhe und jemanden, der erzählt, ohne zu dozieren.',
            },
            {
              title: 'Reisende, die Herkunft suchen',
              text: 'Wollen etwas, das es nur hier gibt — und einen Grund, es mitzunehmen.',
              note: 'Brauchen von uns: die Geschichte der Saison in Worten, die auch auf eine Packung passen.',
            },
          ],
        },
        {
          kind: 'text',
          label: 'Bewusst nicht',
          text: 'Wir sind nicht für Menschen da, die eine große Karte, Sirup-Varianten oder das schnellste Getränk der Straße suchen. Das ist keine Abwertung — es ist eine andere Aufgabe.',
        },
      ],
    },

    // ── 2 Purpose, Vision, Mission ───────────────────────────────────────
    {
      id: 'pvm',
      anchor: 'purpose',
      title: 'Purpose, Vision, Mission',
      state: 'done',
      blocks: [
        {
          kind: 'lead',
          label: 'Purpose',
          text: 'Es gibt uns, damit vielbeschäftigte Menschen auf Oʻahu einen ehrlichen, ruhigen Moment am Tag bekommen — eine Tasse, deren Anbau, Röstung und Ausschank Menschen mit Namen verantworten.',
          note: 'Anti-Purpose: nie der schnellste Coffee-to-go der Straße sein.',
        },
        {
          kind: 'text',
          label: 'Vision',
          text: 'In fünf Jahren ist eine Tasse Kaffee auf Oʻahu so nachvollziehbar wie ein Fisch auf der Karte: mit Ort, Saison und Namen — und niemand findet das mehr besonders.',
        },
        {
          kind: 'text',
          label: 'Mission',
          text: 'Wir rösten eine Sorte pro Saison, nennen jede Herkunft und jeden Preis öffentlich und schenken dort aus, wo die Röstmaschine steht. Jede Saison bringt eine neue Tafel — und eine Erklärung, was sich geändert hat.',
        },
      ],
    },

    // ── 3 Positionierung ─────────────────────────────────────────────────
    {
      id: 'positionierung',
      anchor: 'positionierung',
      title: 'Positionierung',
      state: 'done',
      blocks: [
        {
          kind: 'text',
          label: 'Kategorie',
          text: 'Spezialitätenkaffee, lokal geröstet — Premium ohne Hochglanz.',
        },
        {
          kind: 'lead',
          label: 'Erste Wahl für',
          text: 'Erste Wahl für Menschen auf Oʻahu, die wissen wollen, wer ihren Kaffee gemacht hat.',
        },
        {
          kind: 'list',
          label: 'Was daraus folgt',
          items: [
            'Eine Röstung pro Saison — Tiefe statt Auswahl.',
            'Jeder Preis trägt seinen Grund, öffentlich und vor der Erhöhung.',
            'Kein Wachstum über Filialen, solange die Röstung nicht mitwächst.',
          ],
        },
      ],
    },

    // KAPITEL 4 „Markenarchitektur" ENTFÄLLT OHNE LÜCKE (§2.2): Kailua hat
    // keine Untermarken, die Weiche B2 ist nie gelaufen. Ein leeres Kapitel
    // wäre eine Lücke, die etwas behauptet.

    // ── 5 Werte ──────────────────────────────────────────────────────────
    {
      id: 'werte',
      anchor: 'werte',
      title: 'Werte',
      state: 'done',
      blocks: [
        {
          kind: 'cards',
          label: 'Drei Werte, je mit einem gelebten Beispiel',
          items: [
            {
              title: 'Klartext',
              text: 'Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt.',
              note: 'Gelebt: Als die Ernte 2026 kleiner ausfiel, stand der neue Preis eine Woche vorher an der Tafel — mit dem Grund darunter.',
            },
            {
              title: 'Handwerk',
              text: 'Lieber eine Röstung perfekt als fünf Sorten mittelmäßig.',
              note: 'Gelebt: Wir haben die zweite Maschine abbestellt und Keanu stattdessen drei Monate in Kona ausbilden lassen.',
            },
            {
              title: 'Nähe',
              text: 'Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat.',
              note: 'Gelebt: Jede Tüte trägt das Kürzel des Rösters; wer fragt, bekommt die Person und keine Hotline.',
            },
          ],
        },
        {
          kind: 'text',
          label: 'Wenn zwei Werte kollidieren',
          text: 'Klartext schlägt Nähe. Wir sagen auch dem Stammgast, dass seine Lieblingsröstung diese Saison nicht kommt — freundlich, aber am selben Tag, an dem wir es wissen.',
        },
        {
          kind: 'list',
          label: 'Was wir nie sein wollen',
          items: [
            'Ein Ort, an dem man nach der Herkunft fragen muss.',
            'Eine Marke, die Preise still erhöht und hofft, dass es niemandem auffällt.',
            'Eine Theke, an der Geschwindigkeit über Handwerk gestellt wird.',
          ],
        },
      ],
    },

    // ── 6 Persönlichkeit & Stimme ────────────────────────────────────────
    {
      id: 'stimme',
      anchor: 'stimme',
      title: 'Persönlichkeit & Stimme',
      state: 'done',
      blocks: [
        {
          kind: 'text',
          label: 'Archetyp',
          text: 'Der Weise mit einem Rest Schöpfer: erklärt gern, ohne zu dozieren. Wir wollen, dass jemand nach einem Gespräch mit uns etwas weiß, das er vorher nicht wusste — und sich dabei nicht klein vorkommt.',
        },
        {
          kind: 'chips',
          label: 'So klingen wir — je ein Wort, je eine Probe',
          items: [
            { word: 'ruhig', sample: '„Die Maschine läuft seit sechs. Wir haben Zeit."' },
            { word: 'fundiert', sample: '„Diese Bohne kommt aus Kona, 600 Meter, Ernte im Februar. Deshalb schmeckt sie nach Mandel."' },
            { word: 'gerade heraus', sample: '„Der Preis ist gestiegen. Die Ernte war kleiner, wir zahlen mehr — ihr auch."' },
            { word: 'warm, aber nie anbiedernd', sample: '„Schön, dass du da bist. Willst du wissen, was heute in der Kanne ist?"' },
          ],
        },
        {
          kind: 'dodont',
          label: 'Do & Don’t',
          pairs: [
            { doText: 'unsere Bohnen', dontText: 'Premium-Arabica-Selektion' },
            { doText: 'langsam geröstet, 14 Minuten', dontText: 'in einem exklusiven Verfahren veredelt' },
            { doText: 'eine Pause', dontText: 'ein Genuss-Erlebnis' },
            { doText: 'von Hand', dontText: 'Deluxe' },
            { doText: 'Die Ernte war klein, deshalb kostet es mehr.', dontText: 'Aufgrund von Lieferkettenherausforderungen mussten wir die Preise anpassen.' },
          ],
        },
        {
          kind: 'list',
          label: 'Wörter, die wir nie benutzen',
          items: ['Genuss-Erlebnis', 'Auszeit', 'Deluxe', 'Premium-Arabica-Selektion'],
        },
      ],
    },

    // ── 7 Manifest ───────────────────────────────────────────────────────
    {
      id: 'manifest',
      anchor: 'manifest',
      title: 'Manifest',
      state: 'done',
      blocks: [
        {
          kind: 'text',
          text: 'Wir glauben, dass Kaffee kein Treibstoff ist, sondern eine Pause. Dass man wissen darf, woher er kommt und wer ihn gemacht hat. Und dass ein ruhiger Moment am Tag kein Luxus ist — sondern das Mindeste.',
        },
        {
          kind: 'text',
          text: 'Deshalb rösten wir eine Sorte pro Saison statt fünf das ganze Jahr. Deshalb hängt die Herkunft an der Wand und nicht im Kleingedruckten. Deshalb steht die Maschine im Raum und nicht im Keller. Und deshalb sagen wir es, wenn etwas teurer wird, bevor jemand die Tafel liest.',
        },
        {
          kind: 'lead',
          label: 'Die Zeile für die Wand',
          text: 'Ein ehrlicher, ruhiger Moment am Tag.',
        },
      ],
    },

    // ── 8 Tagline & Messaging ────────────────────────────────────────────
    {
      id: 'messaging',
      anchor: 'messaging',
      title: 'Tagline & Messaging',
      state: 'done',
      blocks: [
        {
          kind: 'lead',
          label: 'Tagline',
          text: 'One honest, quiet moment a day.',
          note: 'Englisch, weil die Marke auf Oʻahu englisch spricht — das Handbuch bleibt deutsch.',
        },
        {
          kind: 'cards',
          label: 'Boilerplates — drei Längen, wörtlich zu übernehmen',
          items: [
            {
              title: 'Kurz · 25 Wörter',
              text: 'Kailua Coffee Co. ist eine Rösterei mit Ausschank auf Oʻahu. Eine Röstung pro Saison, Herkunft mit Namen, Preise ohne Sternchen.',
            },
            {
              title: 'Mittel · 50 Wörter',
              text: 'Kailua Coffee Co. ist eine Rösterei mit eigenem Ausschank in Kailua auf Oʻahu. Anbau, Röstung und Ausschank liegen in einer Hand. Wir rösten eine Sorte pro Saison und nennen Ort, Monat und Person öffentlich — an der Tafel neben der Theke. Gegründet 2026.',
            },
            {
              title: 'Lang · 100 Wörter',
              text: 'Kailua Coffee Co. ist eine Rösterei mit eigenem Ausschank in Kailua auf Oʻahu, gegründet 2026. Anbau, Röstung und Ausschank liegen in einer Hand — damit nachvollziehbar bleibt, wer welche Entscheidung getroffen hat. Statt einer großen Karte gibt es eine Röstung pro Saison, langsam geröstet und offen erklärt: Ort, Höhenlage, Erntemonat und die Person, die geröstet hat, stehen an der Tafel neben der Theke. Preise werden angekündigt, bevor sie sich ändern, samt Grund. Wer bei uns Kaffee trinkt, soll wissen, was er in der Hand hält — und dafür einen ruhigen Moment bekommen statt eines Bechers im Vorbeigehen.',
            },
          ],
        },
        {
          kind: 'cards',
          label: 'Kernbotschaften je Zielgruppe',
          items: [
            { title: 'Pendler mit Ritual', text: 'Dieselbe Tasse, jeden Morgen, in derselben Qualität — und immer jemand, der deinen Namen kennt.' },
            { title: 'Nachbarschaft am Wochenende', text: 'Eine Stunde bleiben, die Tafel lesen, fragen. Wir erklären gern, was gerade in der Kanne ist.' },
            { title: 'Reisende, die Herkunft suchen', text: 'Eine Röstung, die es nur diese Saison und nur hier gibt — mit Ort und Namen auf der Tüte.' },
          ],
        },
        {
          kind: 'text',
          label: 'Wiedererkennungs-Anker',
          text: 'Die Herkunftstafel neben der Theke — handgeschrieben, jede Saison neu. Sie taucht in jedem Foto, jeder Packung und jedem Post wieder auf.',
        },
      ],
    },

    // ── 9 Name (im Dummy das EINE offene Kapitel) ────────────────────────
    {
      id: 'name',
      anchor: 'name',
      title: 'Name',
      state: 'pending',
      note: 'Die Prüfung liegt vor, die Entscheidung fehlt noch.',
      blocks: [
        {
          kind: 'table',
          label: 'Top drei',
          columns: ['Kandidat', 'Herkunft', 'Urteil'],
          rows: [
            ['Kailua Coffee Co.', 'Ortsname als Herkunftsversprechen', 'Empfehlung — sagt sofort, wo geröstet wird'],
            ['Windward Roast', 'Die Luvseite der Insel', 'Stark, aber ohne Ort im Namen'],
            ['Sechs Uhr', 'Wenn die Maschine anläuft', 'Schön auf Deutsch, unklar auf Englisch'],
          ],
        },
        {
          kind: 'table',
          label: 'Prüfung',
          columns: ['Geprüft', 'Ergebnis'],
          rows: [
            ['Domain', 'kailuacoffee.co frei'],
            ['Social Handles', '@kailuacoffee auf beiden Plattformen frei'],
            ['Marken-Recherche (erste Runde)', 'keine Kollision in Klasse 30'],
            ['Aussprache EN / DE', 'trägt in beiden Sprachen'],
            ['Zweitbedeutung', 'keine — Kailua ist der Ort'],
          ],
        },
      ],
    },

    // ── 10 Visuelle Identität — die sichtbare Schranke (§2.5) ────────────
    {
      id: 'visuell',
      anchor: 'visuell',
      title: 'Visuelle Identität',
      state: 'locked',
      note: 'Gehört zum Fundament dazu, entsteht aber erst im Brand Design — hergeleitet aus dem, was oben steht.',
      blocks: [
        { kind: 'locked', title: 'Logo', text: 'Wort- oder Bildmarke samt Schutzraum und Mindestgröße — hergeleitet aus Archetyp und Wiedererkennungs-Anker.', product: 'Brand Design' },
        { kind: 'locked', title: 'Farbwelt', text: 'Eine Grundfarbe mit zwei bis vier Begleitern, kontrastgeprüft — hergeleitet aus Archetyp und Positionierung.', product: 'Brand Design' },
        { kind: 'locked', title: 'Typografie', text: 'Ein Schriftpaar für Überschrift und Text plus eine Mono für Herkunft und Preise — hergeleitet aus den Ton-Wörtern.', product: 'Brand Design' },
        { kind: 'locked', title: 'Bildsprache', text: 'Was auf ein Foto darf und was nie — hergeleitet aus Werten und Zielgruppen.', product: 'Brand Design' },
        { kind: 'locked', title: 'Motion', text: 'Tempo und Ruhe der Bewegung — hergeleitet aus dem Ton-Wort „ruhig".', product: 'Brand Design' },
      ],
    },

    // ── 11 Regeln für KI-Texte ───────────────────────────────────────────
    {
      id: 'ki-texte',
      anchor: 'ki-texte',
      title: 'Regeln für KI-Texte',
      state: 'done',
      note: 'Ein fester Rahmen, gefüllt aus euren Werten — keine eigene Erfindung, so aktuell wie die Kapitel darüber.',
      blocks: [
        {
          kind: 'aiRules',
          tone: ['ruhig', 'fundiert', 'gerade heraus', 'warm, aber nie anbiedernd'],
          avoid: ['Genuss-Erlebnis', 'Auszeit', 'Deluxe', 'Premium-Arabica-Selektion', 'Superlative ohne Beleg'],
          stands: ['Klartext', 'Handwerk', 'Nähe'],
          note: 'Zum Kopieren in ChatGPT, Claude oder das Redaktionssystem.',
        },
        {
          kind: 'text',
          text: 'Zusatzregel für jeden generierten Text: Wenn eine Zahl, eine Herkunft oder ein Preis darin vorkommt, muss sie aus der Herkunftstafel stammen. Erfundene Details sind bei uns kein Stilfehler, sondern ein Bruch mit dem Wert Klartext.',
        },
      ],
    },
  ],
}

/**
 * KAPITEL 10 MIT GEWÄHLTER RICHTUNG (`?richtung=warm`, §2.5).
 *
 * Der Prototyp zeigt damit BEIDE Zustände derselben Stelle: die Schranke und
 * das, was nach `result.direction` dort steht. Die Richtungen selbst sind ein
 * eigenes Paket mit Davids Gate (G4) — hier steht nur eine, damit die Form
 * beurteilt werden kann.
 */
export const demoDirectionChapter: FdChapterData = {
  id: 'visuell',
  anchor: 'visuell',
  title: 'Visuelle Identität',
  state: 'done',
  note: 'Richtung gewählt am 5. September 2026 — die Ausarbeitung entsteht im Brand Design.',
  blocks: [
    {
      kind: 'lead',
      label: 'Gewählte Richtung',
      text: 'Warm & Editorial',
      note: 'Passt zu „Der Weise" und zu ruhig/fundiert: viel Papierweiß, ruhige Zeilen, Farbe als Erdton statt als Signal.',
    },
    {
      kind: 'swatches',
      label: 'Farbrampe',
      items: KAILUA_PALETTE,
    },
    {
      kind: 'text',
      label: 'Schriftpaar',
      text: 'Serif + Grotesk — eine warme Serif für Überschriften (buchhaft, ruhig), eine humanistische Grotesk für den Text. Mono bleibt den Herkunftsangaben vorbehalten.',
    },
    {
      kind: 'text',
      label: 'Was noch folgt',
      text: 'Logo, Bildsprache und Motion werden im Brand Design auf dieser Richtung ausgearbeitet — dieselbe Herleitung, ein Schritt weiter.',
    },
  ],
}
