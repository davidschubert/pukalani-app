import type { BwRailLayer, BwRailSession, BwRailStep } from '../../../app/components/BwProgressRail.vue'
import { type DsChapterKey, DS_CHAPTERS, dsChapterPath } from './demoDesign'
import { type DkChapterKey, DK_CHAPTERS, dkChapterPath } from './demoKit'

/** Statische Dummy-Daten (P0b): die fünf Schichten, Baustein C aktiv.
 *  Runde 45 (David): JEDER Schritt trägt sein Info-Paket für den
 *  Erklär-Layer — Bedeutung im Markenkosmos + Entscheidungen mit Erklärung. */
export const demoRail: BwRailLayer[] = [
  {
    id: 'foundation',
    /* Davids Entscheidung 2026-09-02: Brand Language ist IN der Foundation
     * aufgegangen (ein Wizard, ein Dokument, George durchgehend) — die
     * Tagline/Naming-Kapitel stehen jetzt vor dem Foundation-Ergebnis. */
    label: 'Brand Foundation',
    note: 'Wer ihr seid und wofür ihr steht',
    info: {
      description: 'Das Fundament eurer Marke: wer ihr seid, wofür ihr steht und wie ihr klingt. Alles Spätere — Design, Book, Website — wird hieraus hergeleitet; deshalb steht diese Schicht am Anfang und trägt die meisten Entscheidungen.',
      minutes: '~34 Min',
      bausteine: [
        { label: 'Kontext', note: 'Wer ihr seid, was ihr anbietet, für wen — und euer Marktumfeld.', done: true },
        { label: 'Purpose, Vision & Mission', note: 'Warum es euch gibt, wohin ihr wollt, wie ihr dorthin kommt.', done: true },
        { label: 'Werte', note: 'Die Verhaltensregeln eurer Marke — gerade im Gespräch.' },
        { label: 'Archetyp & Stimme', note: 'Euer Charakter und wie er klingt.' },
        { label: 'Manifest', note: 'Die ganze Foundation als ein Text mit Haltung.' },
      ],
    },
    steps: [
      {
        id: 'context',
        label: 'Kontext',
        icon: 'i-ph-globe-simple',
        state: 'done',
        info: {
          description: 'Der Kontext ist der Boden, auf dem alles steht: Wer ihr seid, was ihr anbietet, für wen — und in welchem Markt ihr euch bewegt. Jede spätere Empfehlung von George stützt sich auf diese Fakten; ohne sauberen Kontext wären Werte, Archetyp und Tagline geraten statt hergeleitet.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Steckbrief', note: 'Wer ihr seid, seit wann, in welcher Form — die nackten Fakten.', done: true },
            { label: 'Angebot', note: 'Was ihr verkauft und was es besonders macht.', done: true },
            { label: 'Zielgruppe', note: 'Für wen ihr da seid — und für wen bewusst nicht.', done: true },
            { label: 'Marktumfeld', note: 'Wettbewerber und wie sie auftreten — die Lücke, in die ihr stoßt.', done: true },
            { label: 'Positionierung', note: 'Für wen, gegen wen, warum ihr — die eine Kernentscheidung der Strategie.', done: true },
            { label: 'Markenarchitektur', note: 'Eine Marke oder mehrere? Nur per Weiche, wenn Produktmarken geplant sind.', done: true },
          ],
        },
      },
      {
        id: 'pvm',
        label: 'Purpose, Vision & Mission',
        icon: 'i-ph-target',
        state: 'done',
        info: {
          description: 'Der Kompass der Marke: Der Purpose sagt, warum es euch gibt. Die Vision, wohin ihr wollt. Die Mission, wie ihr dorthin kommt. Zusammen sind sie die Messlatte für jede Entscheidung — von der Preisliste bis zum Instagram-Post.',
          minutes: '~10 Min',
          bausteine: [
            { label: 'Purpose-Satz', note: 'Ein Satz, warum es euch gibt — ohne Produkt, ohne Floskel.', done: true },
            { label: 'Warum es euch gibt', note: 'Die Geschichte hinter dem Satz, in euren Worten.', done: true },
            { label: 'Vision', note: 'Das Zielbild in 5–10 Jahren — wie sieht die Welt aus, wenn es klappt?', done: true },
            { label: 'Mission', note: 'Was ihr konkret tut, um dorthin zu kommen.', done: true },
          ],
        },
      },
      {
        id: 'values',
        label: 'Werte',
        icon: 'i-ph-scales',
        state: 'active',
        slots: '2 von 5 Entscheidungen',
        minutes: '~8 Min',
        info: {
          description: 'Werte sind die Verhaltensregeln eurer Marke: Sie sagen, wie ihr entscheidet, wenn es unbequem wird. In der Brand Foundation sind sie das Scharnier zwischen Purpose (warum es euch gibt) und Archetyp & Stimme (wie ihr klingt) — jede spätere Design- und Textentscheidung wird an ihnen gemessen.',
          minutes: '~8 Min',
          bausteine: [
            { label: 'Wertekandidaten', note: 'Wörter, die aus deinen Antworten kommen — die Rohliste.', done: true },
            { label: 'Kernwerte (3–5)', note: 'Die Auswahl, die ihr wirklich verteidigt — auch wenn es Geld kostet.', done: true },
            { label: 'Verhaltensregeln', note: 'Je Wert ein Satz: Woran erkennt man ihn im Alltag?' },
            { label: 'Anti-Werte', note: 'Was ihr nie sein wollt — die Grenze nach außen.' },
            { label: 'Beweise', note: 'Echte Beispiele, die jeden Wert belegen — Futter für Website und Pitch.' },
          ],
        },
      },
      {
        id: 'archetype',
        label: 'Archetyp & Stimme',
        icon: 'i-ph-mask-happy',
        state: 'open',
        info: {
          description: 'Der Archetyp gibt eurer Marke einen wiedererkennbaren Charakter — ein Muster, das Menschen intuitiv verstehen (der Weise, der Entdecker, der Fürsorgliche …). Daraus leitet sich die Stimme ab: wie ihr klingt, worüber ihr sprecht und worüber nie. So schreibt jeder im Team, als schriebe dieselbe Person.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Archetyp-Profil', note: 'Euer Hauptmuster mit Anteilen — hergeleitet aus Kontext und Werten.' },
            { label: 'Tonalität', note: 'Drei Adjektive und ihre Grenzen: warm, aber nie anbiedernd.' },
            { label: 'Stimm-Beispiele', note: 'Derselbe Satz in eurer Stimme und in der falschen — zum Fühlen.' },
            { label: 'Do & Don’t der Sprache', note: 'Wörter, die ihr benutzt — und die, die euch fremd sind.' },
          ],
        },
      },
      {
        id: 'manifesto',
        label: 'Manifest',
        icon: 'i-ph-scroll',
        state: 'open',
        info: {
          description: 'Das Manifest verdichtet die ganze Foundation in einen Text mit Haltung — das Stück, das man laut vorlesen kann: auf der Website, im Pitch, beim Onboarding neuer Leute. Es entsteht aus Purpose, Werten und Stimme, nicht umgekehrt.',
          minutes: '~4 Min',
          bausteine: [
            { label: 'Manifest-Text', note: 'Georges Entwurf aus allem, was ihr geklärt habt — von euch geschärft.' },
            { label: 'Kernsätze', note: 'Zwei, drei Zeilen daraus, die allein stehen können — zitierfähig.' },
          ],
        },
      },
      {
        id: 'messaging',
        label: 'Tagline & Messaging',
        icon: 'i-ph-chat-circle-text',
        state: 'open',
        info: {
          description: 'Die Tagline ist der eine Satz neben eurem Namen; das Messaging sind die Kernbotschaften dahinter — was ihr wem sagt, damit es hängen bleibt. Beides baut auf der Foundation auf: Ohne geklärte Werte klingt jede Tagline beliebig.',
          minutes: '~7 Min',
          bausteine: [
            { label: 'Tagline-Kandidaten', note: 'Mehrere Richtungen aus eurer Stimme — mit Herleitung, nicht aus dem Hut.' },
            { label: 'Kernbotschaften', note: 'Je Zielgruppe die eine Sache, die ankommen muss.' },
            { label: 'Elevator Pitch', note: 'Euer Angebot in 30 Sekunden — für Menschen, nicht für Prospekte.' },
          ],
        },
      },
      {
        id: 'naming',
        label: 'Name & Prüfung',
        icon: 'i-ph-seal-check',
        state: 'open',
        info: {
          description: 'Ob neue Marke oder Prüfstand für den Bestandsnamen: Hier wird der Name an der Foundation gemessen — passt er zu Purpose, Werten und Archetyp? Dazu die nüchterne Prüfung: Ist er frei, ist er aussprechbar, funktioniert er auch auf Englisch?',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Namens-Kandidaten', note: 'Vorschläge mit Begründung aus eurer Markenwelt.' },
            { label: 'Verfügbarkeits-Check', note: 'Domain, Social Handles, erste Marken-Recherche — Hinweise, keine Rechtsberatung.' },
            { label: 'Sprach-Check', note: 'Aussprache, Schreibweise, ungewollte Bedeutungen in anderen Sprachen.' },
          ],
        },
      },
      { id: 'foundation-result', kind: 'result', label: 'Ergebnis', icon: '', state: 'open', to: '/brand/demo/ergebnis' },
    ],
  },
  {
    id: 'design',
    steps: [
      {
        id: 'design-color',
        label: 'Farbwelt',
        icon: '',
        state: 'open',
        info: {
          description: 'Eure Farben kommen nicht aus dem Katalog: George leitet eine Basisfarbe aus Archetyp und Werten her und baut daraus eine geprüfte Hell- und Dunkel-Rampe mit barrierefreien Kontrast-Paaren.',
          minutes: '~10 Min',
          bausteine: [
            { label: 'Basisfarbe', note: 'Hergeleitet aus Archetyp + Werten — mit Begründung.' },
            { label: 'Hell-/Dunkel-Rampe', note: 'Automatisch erzeugt, Kontrast-geprüft — ihr bestätigt.' },
            { label: 'Akzentfarbe', note: 'Der eine Pop — sparsam eingesetzt.' },
            { label: 'Einsatzregeln', note: 'Was wofür: Flächen, Text, Signale.' },
          ],
        },
      },
      {
        id: 'design-type',
        label: 'Typografie',
        icon: '',
        state: 'open',
        info: {
          description: 'Schrift ist Stimme in Form: Aus eurer Tonalität schlägt George Schriftrollen vor — Text, Überschrift, Mono — und legt Grade und Hierarchie fest.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Textschrift', note: 'Die Arbeitsschrift — lesbar, passend zur Stimme.' },
            { label: 'Überschrift-Schrift', note: 'Der Charakterkopf — darf mehr wagen.' },
            { label: 'Hierarchie & Grade', note: 'Größen und Gewichte als System.' },
          ],
        },
      },
      {
        id: 'design-logo',
        label: 'Logo & Zeichen',
        icon: '',
        state: 'open',
        info: {
          description: 'Die Richtung eures Zeichens — Wortmarke, Bildmarke oder beides — samt Varianten für App-Icon und Avatar, Schutzraum und Minimalgrößen.',
          minutes: '~8 Min',
          bausteine: [
            { label: 'Richtung', note: 'Wortmarke, Bildmarke oder Kombination — begründet aus der Foundation.' },
            { label: 'Varianten', note: 'App-Icon, Avatar, Favicon.' },
            { label: 'Schutzraum & Minimalgrößen', note: 'Damit das Zeichen überall sauber steht.' },
            { label: 'Datei-Set', note: 'Exporte für Web, Print und Social.' },
          ],
        },
      },
      {
        id: 'design-imagery',
        label: 'Bildsprache & Ikonografie',
        icon: '',
        state: 'open',
        info: {
          description: 'Wie eure Marke aussieht, wenn sie nicht spricht: Fotografie-Stil, Illustrations- und Icon-Stil — mit Do-&-Don’t-Beispielen zum Fühlen.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Fotografie-Stil', note: 'Licht, Ausschnitt, Menschen — was zu euch passt.' },
            { label: 'Illustrations-Stil', note: 'Ob und wie ihr zeichnet.' },
            { label: 'Icon-Stil', note: 'Linie oder Fläche, rund oder kantig.' },
          ],
        },
      },
      {
        id: 'design-motion',
        label: 'Motion',
        icon: '',
        state: 'open',
        info: {
          description: 'Bewegung mit Charakter: Tempo und Übergänge (150–250 ms), ob euer Logo sich bewegt — und was bei reduzierter Bewegung passiert.',
          minutes: '~5 Min',
          bausteine: [
            { label: 'Tempo-Charakter', note: 'Ruhig oder lebendig — aus dem Archetyp.' },
            { label: 'Logo-Animation', note: 'Kinetisches Logo ja/nein, reduced-motion-fest.' },
          ],
        },
      },
      { id: 'design-result', kind: 'result', label: 'Ergebnis', icon: '', state: 'open', to: '/brand/demo/ergebnis' },
    ],
    label: 'Brand Design',
    locked: true,
    lockedNote: 'Baut auf deiner Foundation auf',
    info: {
      description: 'Die visuelle Identität eurer Marke — hergeleitet aus Foundation und Brand Language, nicht aus dem Katalog. Farben und Schrift entstehen aus Archetyp, Werten und Stimme; jede Entscheidung trägt eine Begründung.',
      minutes: '~35 Min',
      bausteine: [
        { label: 'Farbwelt', note: 'Basisfarbe aus Archetyp + Werten, Hell-/Dunkel-Rampe mit geprüften Kontrast-Paaren, Akzent, Einsatzregeln.' },
        { label: 'Typografie', note: 'Schriftrollen (Text, Überschrift, Mono), Grade und Hierarchie — vorgeschlagen aus Stimme und Archetyp.' },
        { label: 'Logo & Zeichen', note: 'Wort-/Bildmarke, Varianten (App-Icon, Avatar), Schutzraum und Minimalgrößen.' },
        { label: 'Bildsprache & Ikonografie', note: 'Fotografie-Stil, Illustrations- und Icon-Stil — mit Do-&-Don’t-Beispielen zum Fühlen.' },
        { label: 'Motion', note: 'Tempo-Charakter, kinetisches Logo, reduced-motion-Verhalten.' },
      ],
    },
  },
  /*
   * SCHICHT 3 — „Brand Book & Kit" (Konzept docs/plans/BRAND-BOOK-KIT.md
   * §2.7, Copy nach §1.11 e / §2.14).
   *
   * Der Zuschnitt ist mit BK1 ein anderer als in den ersten Runden: es gibt
   * KEINE „Templates" und kein „Strategy Playbook" mehr (Social-Set und
   * Content-Kompass gehören zu Produkt 04, §2.16). Was bleibt, sind die drei
   * Bausteine, die BK1 wirklich liefert — Brand Book, Kit & Brand Context,
   * Pressekit — plus die Lieferseite als eigener Punkt (§2.20 Nr. 2).
   */
  {
    id: 'book',
    steps: [
      {
        id: 'book-book',
        label: 'Brand Book',
        icon: '',
        state: 'open',
        info: {
          description: 'Euer Regelwerk wächst aus den fertigen Schichten: dieselbe Leseansicht, nur mit den Regel-Kapiteln — Nomenklatur, Zeichen-, Farb- und Typografie-Anwendung, AI-Guidelines.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Regel-Kapitel', note: 'Zeichen, Farbe und Typografie als Regelwerk statt als Vitrine.' },
            { label: 'Nomenklatur', note: 'Wie neue Produkte, Orte und Formate heißen — nur mit Markenarchitektur.' },
            { label: 'AI-Guidelines', note: 'Was KI in eurer Stimme erzeugen darf, wer freigibt, welche Tabus gelten.' },
          ],
        },
      },
      {
        id: 'book-kit',
        label: 'Kit & Brand Context',
        icon: '',
        state: 'open',
        info: {
          description: 'Das Kit arbeitet: Design-Tokens für hell und dunkel in einer Datei (DTCG), dazu tokens.css — und der Brand Context als brand.md und brand.json, direkt als System-Prompt einsetzbar.',
          minutes: '~5 Min',
          bausteine: [
            { label: 'Design-Tokens', note: 'Hell und dunkel mit denselben Rollen-Namen, Kontrast-Urteile als Beleg.' },
            { label: 'brand.md', note: 'Euer Brand Context als Markdown — für ChatGPT, Claude und Agenten.' },
            { label: 'brand.json', note: 'Dieselben Werte maschinenlesbar, plus Zeichen als SVG.' },
          ],
        },
      },
      {
        id: 'book-presskit',
        label: 'Pressekit',
        icon: '',
        state: 'open',
        info: {
          description: 'Fast gratis aus Book und Kit: Boilerplates in drei Längen, Tagline, Zeichen — und die Fakten, die ihr einzeln freigebt.',
          minutes: '~4 Min',
          bausteine: [
            { label: 'Fakten-Freigabe', note: 'Je Fakt ein Häkchen — Voreinstellung ist: keiner reist.' },
            { label: 'Presse-Kontakt', note: 'Eine Ansprechperson, die öffentlich reist — optional.' },
            { label: 'Boilerplates', note: 'Kurz, mittel, lang — wörtlich zu übernehmen.' },
          ],
        },
      },
      { id: 'book-result', kind: 'result', label: 'Ergebnis', icon: '', state: 'open', to: '/brand/demo/ergebnis' },
    ],
    label: 'Brand Book & Kit',
    locked: true,
    lockedNote: 'Teil der Ableitung — nach dem Erstgespräch',
    info: {
      description: 'Regelwerk und Werkzeuge: Das Book erklärt, das Kit arbeitet. Hier wird nichts Neues entschieden — es wird kuratiert und ausgeliefert, was in Foundation und Design längst steht.',
      minutes: '~15 Min',
      bausteine: [
        { label: 'Brand Book', note: 'Regel-Kapitel aus euren Schichten: Nomenklatur, Zeichen-, Farb- und Typografie-Anwendung, AI-Guidelines.' },
        { label: 'Kit & Brand Context', note: 'Design-Tokens hell/dunkel (DTCG + CSS), brand.md und brand.json, Zeichen als SVG.' },
        { label: 'Pressekit', note: 'Boilerplates in drei Längen, Tagline, freigegebene Fakten, Ansprechperson.' },
      ],
    },
  },
  {
    id: 'experience',
    steps: [
      {
        id: 'exp-website',
        label: 'Website',
        icon: '',
        state: 'open',
        info: {
          description: 'Eure Marke als Website: Seitentypen aus euren Zielen, das Theme aus eurem Design — und ein Startseiten-Hero, der die Tagline trägt.',
          minutes: '~5 Min',
          bausteine: [
            { label: 'Seitentypen', note: 'Was eure Site braucht — aus Zielen und Zielgruppe.' },
            { label: 'Theme-Anwendung', note: 'Farben und Schrift werden zur laufenden Site.' },
            { label: 'Startseiten-Hero', note: 'Der erste Eindruck, aus Tagline + Bildsprache.' },
          ],
        },
      },
      {
        id: 'exp-social',
        label: 'Social',
        icon: '',
        state: 'open',
        info: {
          description: 'Profile je Plattform, ein Content-Kompass mit 3–5 Säulen und Taktung — und die Interaktions-Stimme: wie ihr antwortet, nicht nur wie ihr postet.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Profile', note: 'Bio, Avatar, Banner — je Plattform konsistent.' },
            { label: 'Content-Kompass', note: '3–5 Säulen mit Format und Taktung.' },
            { label: 'Interaktions-Stimme', note: 'Kommentare, DMs, Support — in eurem Ton.' },
          ],
        },
      },
      {
        id: 'exp-seo',
        label: 'SEO & GEO',
        icon: '',
        state: 'open',
        info: {
          description: 'Gefunden werden — von Google und von KI-Assistenten: Keywords aus eurer Positionierung, konsistente Entitätsdaten und zitierfähige Markenfakten samt llms.txt. Deckt ab, was draußen SEO, AEO, GEO oder LLMO heißt — für euch ist es EIN Schritt.',
          minutes: '~6 Min',
          bausteine: [
            { label: 'Keyword-Set', note: 'Abgeleitet aus Positionierung + Vokabular.' },
            { label: 'Entitäten-Konsistenz', note: 'Name, Ort, Angebot — überall gleich.' },
            { label: 'Markenfakten & llms.txt', note: 'Zitierfähig für ChatGPT, Perplexity & Co.' },
          ],
        },
      },
      {
        id: 'exp-mail',
        label: 'Newsletter & E-Mail',
        icon: '',
        state: 'open',
        info: {
          description: 'Eure Stimme im Postfach: Absender-Auftritt und ein Template in eurem Design.',
          minutes: '~3 Min',
          bausteine: [
            { label: 'Absender-Stimme', note: 'Von wem kommt die Mail — und wie klingt sie.' },
            { label: 'Template', note: 'Kopf, Fuß, Typografie — einmal sauber.' },
          ],
        },
      },
      {
        id: 'exp-content',
        label: 'Content-Vorlagen',
        icon: '',
        state: 'open',
        info: {
          description: 'Post-Formate, die eure Werte und Beweise wiederverwenden — Inhalte entstehen aus der Foundation, nicht aus dem Bauch.',
          minutes: '~4 Min',
          bausteine: [
            { label: 'Formate', note: 'Je Säule ein wiederholbares Format.' },
            { label: 'Anker', note: 'Feste Wiedererkennungs-Elemente je Format.' },
          ],
        },
      },
      {
        id: 'exp-stationery',
        label: 'Geschäftsausstattung',
        icon: '',
        state: 'open',
        info: {
          description: 'Braucht jede Marke — auch rein digitale: Visitenkarte, Briefbogen und Rechnungsvorlage, E-Mail-Signatur.',
          minutes: '~4 Min',
          bausteine: [
            { label: 'Drucksachen-Set', note: 'Visitenkarte, Briefbogen, Rechnung.' },
            { label: 'E-Mail-Signatur', note: 'Konsistent für alle im Team.' },
          ],
        },
      },
      {
        id: 'exp-local',
        label: 'Vor Ort',
        icon: '',
        state: 'open',
        info: {
          description: 'Nur bei physischem Ort (per Weiche): euer Auftritt dort, wo Kunden euch wirklich begegnen — inklusive Google Maps.',
          minutes: '~4 Min',
          bausteine: [
            { label: 'Google Business', note: 'Profil, Fotos, Kategorien — konsistent zur Marke.' },
            { label: 'Bewertungs-Stimme', note: 'Antworten auf Bewertungen in eurem Ton.' },
            { label: 'Print-Basics', note: 'Schild, Karte, Verpackung.' },
          ],
        },
      },
      {
        id: 'exp-launch',
        label: 'Launch & Ankündigung',
        icon: '',
        state: 'open',
        info: {
          description: 'Wie die Marke in die Welt kommt: die Warum-Story, der Kanal-Plan — und beim Marken-Relaunch zuerst die eigenen Leute. Ein Relaunch ohne Ankündigung verwirrt Bestandskunden; eine neue Marke bekommt ihren Hallo-Welt-Moment.',
          minutes: '~5 Min',
          bausteine: [
            { label: 'Warum-Story', note: 'Der eine Ankündigungs-Text — aus Purpose und Manifest.' },
            { label: 'Kanal-Plan', note: 'Wo zuerst, wo danach — aus eurem Content-Kompass.' },
            { label: 'Intern zuerst', note: 'Bei Teams und Relaunches: die eigenen Leute vor der Welt.' },
          ],
        },
      },
      { id: 'exp-result', kind: 'result', label: 'Ergebnis', icon: '', state: 'open', to: '/brand/demo/ergebnis' },
    ],
    label: 'Brand Experience',
    locked: true,
    lockedNote: 'Website, Social & Content',
    info: {
      description: 'Die Ableitungen: eure Marke im Einsatz. Website, Social, Suche und Newsletter entstehen aus Foundation + Design — welche Inhalte zu euch passen, wissen wir aus Archetyp und Zielgruppe längst.',
      minutes: '~36 Min',
      bausteine: [
        { label: 'Website', note: 'Seitentypen, Theme-Anwendung, Startseiten-Hero.' },
        { label: 'Social', note: 'Profile je Plattform, Content-Kompass (3–5 Säulen mit Taktung) und Interaktions-Stimme — wie ihr antwortet.' },
        { label: 'SEO & GEO', note: 'Keyword-Set aus eurer Positionierung, zitierfähige Markenfakten + llms.txt — gefunden von Google UND von KI-Assistenten.' },
        { label: 'Newsletter & E-Mail', note: 'Absender-Stimme und Template.' },
        { label: 'Content-Vorlagen', note: 'Post-Formate, die Werte und Beweise wiederverwenden.' },
        { label: 'Geschäftsausstattung', note: 'Visitenkarte, Briefbogen und Rechnung, E-Mail-Signatur — braucht jede Marke.' },
        { label: 'Vor Ort', note: 'Nur bei physischem Ort: Google Business, Bewertungs-Antworten in eurer Stimme, Print-Basics.' },
        { label: 'Launch & Ankündigung', note: 'Warum-Story, Kanal-Plan — beim Relaunch zuerst intern.' },
      ],
    },
  },
  {
    id: 'monitoring',
    label: 'Brand Monitoring',
    locked: true,
    lockedNote: 'Nach dem Launch — läuft dauerhaft mit',
    info: {
      description: 'Markenarbeit hört nicht beim Launch auf: Wird eure Marke draußen so beschrieben, wie ihr sie gebaut habt? George prüft regelmäßig das Außenbild, die Konsistenz eurer Kanäle — und was KI-Assistenten über euch sagen.',
      minutes: 'laufend',
      bausteine: [
        { label: 'Außenbild-Check', note: 'Beschreiben Menschen euch so, wie ihr euch selbst? Reviews, Erwähnungen, Suchtreffer.' },
        { label: 'KI-Antwort-Radar', note: 'Was sagen ChatGPT, Perplexity & Co. über euch — und stimmt es?' },
        { label: 'Konsistenz-Radar', note: 'Name, Farben, Stimme über alle Kanäle — Abweichungen werden gemeldet.' },
      ],
    },
    steps: [
      { id: 'mon-outside', label: 'Außenbild-Check', icon: '', state: 'open' },
      { id: 'mon-ai', label: 'KI-Antwort-Radar', icon: '', state: 'open' },
      { id: 'mon-consistency', label: 'Konsistenz-Radar', icon: '', state: 'open' },
    ],
  },
]

/**
 * DIE RAIL DER SCHICHT 2 (Brand Design, Konzept docs/archiv/BRAND-DESIGN.md
 * §2.1 und Screen 8 aus §2.15).
 *
 * Der Layer „Brand Design" oben in dieser Datei ist der GESPERRTE Zustand —
 * er bleibt unverändert, weil er heute überall so aussieht. Diese Funktion
 * baut daraus die zwei anderen Zustände: freigeschaltet (sechs Kapitel, eines
 * aktiv, Sessions darunter) und fertig.
 *
 * Zwei Dinge sind Absicht:
 *  1. Die Foundation-Schritte stehen dabei IMMER auf `done` — Schicht 2 öffnet
 *     laut §2.1 erst nach dem Foundation-Ergebnis; eine offene Foundation
 *     neben einem laufenden Brand Design wäre eine Auskunft, die nicht stimmt.
 *  2. Die Kapitel-Beschriftungen kommen aus `DS_CHAPTERS` (§2.19 Frage 3:
 *     Moodboard · Farbwelt · Typografie · Zeichen · Bildsprache · Bewegung),
 *     NICHT aus dem gesperrten Layer oben — dort stehen noch die alten Namen
 *     („Logo & Zeichen", „Motion"), und zwei Namenslisten für dieselben
 *     Kapitel wären die erste Stelle, an der etwas altert.
 */
export function demoRailWithDesign(options: {
  active?: DsChapterKey | null
  /** false = heutiger Zustand (Schranke + Erklär-Text). */
  unlocked?: boolean
  /** true = alle sechs Kapitel abgenommen, Ergebnis-Punkt erreichbar. */
  done?: boolean
} = {}): BwRailLayer[] {
  const { active = null, unlocked = true, done = false } = options

  return demoRail.map((layer) => {
    if (layer.id === 'foundation' && layer.steps) {
      const steps: BwRailStep[] = layer.steps.map(step => step.kind === 'result'
        ? { ...step, label: 'Brand Foundation', state: 'done', to: '/brand/demo/foundation' }
        : { ...step, state: 'done', slots: undefined, minutes: undefined })
      return { ...layer, steps }
    }
    if (layer.id !== 'design' || !unlocked) return layer

    const activeIndex = DS_CHAPTERS.findIndex(chapter => chapter.key === active)
    const steps: BwRailStep[] = DS_CHAPTERS.map((chapter, i) => {
      const state: BwRailStep['state'] = done || (activeIndex >= 0 && i < activeIndex)
        ? 'done'
        : i === activeIndex ? 'active' : 'open'
      return {
        id: `design-${chapter.key}`,
        label: chapter.label,
        icon: '',
        state,
        to: dsChapterPath(chapter.key),
        minutes: chapter.minutes,
        /* Nur das AKTIVE Kapitel zeigt seine Sessions — die Sidebar rendert
         * sie ohnehin nur dort (BwWorkspaceSidebar), und eine zweite offene
         * Liste wäre Lärm. */
        /* Rückgabetyp annotiert statt `as const` am Ausdruck: ein `as const`
         * auf einem Bedingungs-Ausdruck ist kein gültiges TypeScript
         * (TS1355), und der Union-Typ kommt hier ohnehin aus der Rail. */
        sessions: i === activeIndex
          ? chapter.sessions.map((session, s): BwRailSession => ({
              id: session.id,
              label: session.label,
              effort: session.effort,
              state: s === 0 ? 'active' : 'open',
            }))
          : undefined,
      }
    })
    steps.push({
      id: 'design-result',
      kind: 'result',
      label: 'Visuelle Identität',
      icon: '',
      state: done ? 'done' : 'open',
      /* Das Ergebnis-Board (§2.8) — Kapitel 10 der Foundation trägt dasselbe
       * Board als Kopf, die eigene Ansicht ist die druckbare Fläche. */
      to: '/brand/demo/design/board',
    })
    return {
      ...layer,
      locked: false,
      lockedNote: undefined,
      note: done ? 'Abgeschlossen am 7. September 2026' : 'Freigeschaltet am 7. September 2026',
      steps,
    }
  })
}

/**
 * DIE RAIL DER SCHICHT 3 (Brand Book & Kit, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7 und Screen 7 aus §2.15).
 *
 * Sie baut AUF `demoRailWithDesign` auf: wer bei Book & Kit steht, hat
 * Foundation und Design hinter sich — beides steht deshalb auf `done`. Der
 * Layer „Book & Kit" wird hier aus dem gesperrten Erklär-Layer (oben in dieser
 * Datei, mit der BK1-Copy) zur echten Gruppe mit DREI Kapiteln plus dem
 * Ergebnis-Punkt „Kit".
 *
 * ZWEI DINGE SIND ABSICHT:
 *  1. Der Punkt „Kit" ist ein `result`, kein Kapitel — die Lieferseite
 *     entscheidet nichts (§2.20 Nr. 2). Er steht deshalb dort, wo bei den
 *     anderen Schichten das Ergebnis steht, und nicht zwischen den Kapiteln.
 *  2. Gesperrt bleibt der Layer UNVERÄNDERT (bis auf die neue Copy): die
 *     Schranke ist heute überall dieselbe, und ein zweiter gesperrter Zustand
 *     wäre eine zweite Stelle zum Auseinanderlaufen.
 */
export function demoRailWithKit(options: {
  active?: DkChapterKey | null
  /** false = Schranke „Teil der Ableitung" (Erklär-Layer, kein Kapitel). */
  unlocked?: boolean
  /** true = alle drei Kapitel abgenommen, das Kit steht bereit. */
  done?: boolean
} = {}): BwRailLayer[] {
  const { active = null, unlocked = true, done = false } = options

  return demoRailWithDesign({ unlocked: true, done: true }).map((layer) => {
    if (layer.id !== 'book' || !unlocked) return layer

    const activeIndex = DK_CHAPTERS.findIndex(chapter => chapter.key === active)
    const steps: BwRailStep[] = DK_CHAPTERS.map((chapter, i) => {
      const state: BwRailStep['state'] = done || (activeIndex >= 0 && i < activeIndex)
        ? 'done'
        : i === activeIndex ? 'active' : 'open'
      return {
        id: `kit-${chapter.key}`,
        label: chapter.label,
        icon: '',
        state,
        to: dkChapterPath(chapter.key),
        minutes: chapter.minutes,
        /* Nur das AKTIVE Kapitel zeigt seine Sessions — dieselbe Regel wie in
         * Schicht 2; die Sidebar rendert sie ohnehin nur dort. */
        sessions: i === activeIndex
          ? chapter.sessions.map((session, s): BwRailSession => ({
              id: session.id,
              label: session.label,
              effort: session.effort,
              state: s === 0 ? 'active' : 'open',
            }))
          : undefined,
      }
    })
    steps.push({
      id: 'kit-result',
      kind: 'result',
      label: 'Kit',
      icon: '',
      /* „Erreichbar" heisst für einen Ergebnis-Punkt `done` (die Sidebar sperrt
       * jeden anderen Zustand) — die Lieferseite ist aber auch mitten in der
       * Schicht lesbar: sie sagt ehrlich, was schon geht und was noch fehlt. */
      state: 'done',
      to: '/brand/demo/kit',
    })
    return {
      ...layer,
      locked: false,
      lockedNote: undefined,
      note: done ? 'Abgeschlossen am 9. September 2026' : 'Freigeschaltet am 9. September 2026',
      steps,
    }
  })
}
