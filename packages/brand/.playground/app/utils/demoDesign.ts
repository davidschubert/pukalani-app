/**
 * KLICKDUMMY „BRAND DESIGN" (Produkt 02, Phase 3 zum Konzept
 * docs/archiv/BRAND-DESIGN.md §2.15) — statische Demo-Daten für die sechs
 * Werkstatt-Kapitel Moodboard · Farbwelt · Typografie · Zeichen · Bildsprache
 * · Bewegung (Kapitel-Namen nach §2.19 Frage 3).
 *
 * DIE FORM FOLGT DEM KÜNFTIGEN `BrandDesignPreset` (§2.8), damit der echte
 * Bau die Felder übernehmen kann statt sie neu zu erfinden: `dna`, `color
 * {base, rampLight, rampDark, neutral, accent, roles, contrastPairs}`, `type
 * {pair, scale, rules}`, `mark {kind, brief, examples, keptDrafts}`, `imagery
 * {principles, illustration, icons, dodont}`, `motion {tempo, transitions,
 * logo, rules}`.
 *
 * DREI DINGE, DIE HIER ECHT SIND — und deshalb nicht „vereinfacht" werden
 * dürfen:
 *  1. **Die Farb-Mathematik.** Ramp, getönte Neutral-Ramp und Kontrast-Urteil
 *     kommen aus `packages/themes/shared/ramp.ts` — der pure Teil der
 *     Themes-Engine. §2.3 macht daraus im echten Bau den EINEN A14-Vertrag
 *     (ESLint-Ausnahme mit Begründung); im Dummy ist es derselbe Import,
 *     damit die Zahlen auf dem Bildschirm die Zahlen des Produkts sind.
 *  2. **Die Marke ist Kailua Coffee Co.** und ihre Palette ist die
 *     abgenommene aus `beispiel.vue`/`demoFoundation.ts` (Roast · Crema ·
 *     Milk · Palm · Paper). Es gibt hier KEINE neu erfundenen Farben — alles
 *     andere ist gerechnet.
 *  3. **Die KI-Entwürfe sind Attrappen.** Vier abstrakte SVG-Kompositionen
 *     aus Farbwelt und Formsprache, mit Herkunfts-Zeile und dem Vermerk aus
 *     §1.11 b. Kein Bildmodell, keine Datei, kein Netzzugriff — der Dummy
 *     zeigt die FORM des Bereichs, nicht sein Ergebnis.
 */

/* Der EINZIGE Cross-Layer-Import des Dummys — §2.3: `themes/shared` ist die
 * pure Bibliothek (keine App, kein Server, kein Zustand). Im echten Bau wird
 * genau dieser Import zur benannten ESLint-Ausnahme; hier steht sie als
 * Zeilen-Ausnahme, damit der Wächter für alles andere scharf bleibt. */
// eslint-disable-next-line pukalani/no-cross-layer-relative -- Brand Design §2.3: pure Ramp-/Kontrast-Mathematik aus themes/shared, kein anderer themes-Zugriff.
import { type Shade, contrastRatio, generateNeutralRamp, generateRamp, wcagLevel } from '../../../../themes/shared/ramp'

// ── Die Marke ──────────────────────────────────────────────────────────────

export const DS_BRAND = {
  title: 'Kailua Coffee Co.',
  monogram: 'K',
  /** Die abgenommene Kailua-Palette (Namen wie in der Foundation). */
  palette: {
    roast: '#4a3123',
    crema: '#b98a5e',
    milk: '#e8d3b8',
    palm: '#2f4a3a',
    paper: '#f7f2ea',
  },
  standDate: '7. September 2026',
} as const

// ── Farb-Werkzeug (echte Mathematik, nur eingepackt) ───────────────────────

export type DsRamp = Record<Shade, string>

/* Der Stufen-Union der Engine wird WEITERGEREICHT: so greift keine Seite ein
 * zweites Mal über die Layer-Grenze (§2.3 — die Ausnahme oben ist die eine). */
export type { Shade }

export const DS_SHADES: readonly Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/** Hell-Ramp: die Vorgabe der Engine (wahrgenommene OKLCH-Stufen). */
export function dsRampLight(hex: string): DsRamp | null {
  return generateRamp(hex, { mode: 'perceived' })
}

/**
 * Dunkel-Ramp: DIESELBE Mathematik mit anderen Enden. Die Engine kennt keine
 * zweite Ramp (§2.3 — Brand Design erzeugt nur WERTE in ihrer Form); auf
 * dunklem Grund braucht die Marke oben mehr Luft und unten weniger Tiefe,
 * sonst kippt die 900er-Stufe ins Schwarz des Grundes.
 */
export function dsRampDark(hex: string): DsRamp | null {
  return generateRamp(hex, { mode: 'perceived', lightnessMax: 92, lightnessMin: 11, saturation: 0.92 })
}

/** Getönte Neutral-Ramp — nur der Farbton kommt aus der Basisfarbe. */
export function dsNeutralRamp(hex: string): DsRamp | null {
  return generateNeutralRamp(hex)
}

export interface DsContrast {
  ratio: number
  level: 'AAA' | 'AA' | 'AA18' | 'fail'
}

/** Kontrast zweier Farben mit WCAG-Urteil; `null` bei ungültigem Hex. */
export function dsContrast(fg: string, bg: string): DsContrast | null {
  const ratio = contrastRatio(fg, bg)
  if (ratio === null) return null
  return { ratio, level: wcagLevel(ratio) }
}

/** „4,8:1" — deutsche Schreibweise, eine Nachkommastelle. */
export function dsRatioText(ratio: number): string {
  return `${ratio.toFixed(1).replace('.', ',')}:1`
}

// ── Die Vorschau-Szene: ihre Verträge (§2.9) ───────────────────────────────

/**
 * Die Props der Szene stehen HIER und nicht in der Komponente, weil jede
 * Seite sie baut — und weil `dsSceneColors()` daneben sonst auf einen Typ aus
 * einer `.vue`-Datei zeigen müsste (Zirkel, den man nicht braucht).
 */
export interface DsSceneColors {
  /** Die Basisfarbe — aus ihr ist alles andere gerechnet. */
  base: string
  rampLight: DsRamp
  rampDark: DsRamp
  /** Getönte Neutral-Ramp: Grund, Flächen, Linien. */
  neutral: DsRamp
  accent: string
  /** Der Papierton der Marke (Kailua: Paper). */
  paper: string
}

export interface DsSceneFonts {
  headingStack: string
  bodyStack: string
  headingWeight?: number
  /** Laufweite der Überschrift in px (negativ = enger). */
  headingTracking?: number
  headingUppercase?: boolean
  /** Faktor der Größen-Hierarchie (1 = Vorschlag „ruhig"). */
  scale?: number
}

export interface DsSceneMotion {
  /** Grunddauer in ms. */
  duration: number
  easing: string
  /** Versatz zwischen Geschwistern in ms. */
  stagger: number
}

/**
 * Farbwelt einer Szene aus drei Eingaben — IMMER vollständig.
 *
 * Die Farbwelt-Seite lässt einen Hex TIPPEN: auf dem Weg von `#4` zu
 * `#4a3123` steht dort sekundenlang Unsinn. Eine Szene, die dabei leer wird,
 * flackert bei jedem Tastendruck; deshalb fällt ein ungültiger Wert hier
 * still auf die Marken-Basisfarbe zurück, und die SEITE entscheidet über
 * ihre Eingabe-Prüfung selbst (`DS_HEX_RE`).
 */
export function dsSceneColors(base: string, accent: string, neutralSource: string): DsSceneColors {
  const safeBase = dsRampLight(base) ? base : DS_BRAND.palette.roast
  const safeNeutral = dsNeutralRamp(neutralSource) ? neutralSource : safeBase
  /* Die drei Rufe können nach den zwei Prüfungen oben nicht mehr `null`
   * liefern — dieselbe Basisfarbe, dieselbe Mathematik. */
  return {
    base: safeBase,
    rampLight: dsRampLight(safeBase)!,
    rampDark: dsRampDark(safeBase)!,
    neutral: dsNeutralRamp(safeNeutral)!,
    accent,
    paper: DS_BRAND.palette.paper,
  }
}

/** Eingabe-Prüfung der Hex-Felder (dieselbe Form wie in der Themes-Engine). */
export const DS_HEX_RE = /^#[0-9a-f]{6}$/i

/** Schrift-Props der Szene aus einer Paar-Id plus den Regeln aus `i.rules`. */
export function dsSceneFonts(pairId: string, rules: Partial<DsSceneFonts> = {}): DsSceneFonts {
  const pair = dsFontPair(pairId)
  return {
    headingStack: pair.headingStack,
    bodyStack: pair.bodyStack,
    ...rules,
  }
}

// ── Kapitel-Register (die sechs Kapitel der Schicht 2) ─────────────────────

export type DsChapterKey = 'dna' | 'color' | 'type' | 'mark' | 'imagery' | 'motion'

export interface DsChapter {
  key: DsChapterKey
  /** UI-Name nach §2.19 Frage 3 — „Bewegung" statt „Motion". */
  label: string
  note: string
  minutes: string
  /** Die Sessions des Kapitels (§2.2–§2.7) — Id wie im Konzept (`g.dna`). */
  sessions: { id: string, label: string, effort: string }[]
}

export const DS_CHAPTERS: readonly DsChapter[] = [
  {
    key: 'dna',
    label: 'Moodboard',
    note: 'Vorbilder, Visual DNA und drei Boards',
    minutes: '~12 Min',
    sessions: [
      /* Die Weiche und die zwei Vorbilder-Sessions (Davids Entscheidung
       * 2026-09-08, Konzept §2.2): Richtung aus Foundation UND Vorbildern.
       * Ohne Vorbilder überspringt der Weg `g.inspiration` und `g.reading`. */
      { id: 'g.source', label: 'Woher die Richtung kommt', effort: '~1 Min' },
      { id: 'g.inspiration', label: 'Vorbilder hochladen', effort: '~2 Min' },
      { id: 'g.reading', label: 'Lesung gegen die Foundation', effort: '~1 Min' },
      { id: 'g.dna', label: 'Visual DNA', effort: '~3 Min' },
      { id: 'g.boards', label: 'Drei Moodboards', effort: '~2 Min' },
      { id: 'g.board', label: 'Board wählen', effort: '~1 Min' },
      { id: 'g.mix', label: 'Mix & Match', effort: '~2 Min' },
    ],
  },
  {
    key: 'color',
    label: 'Farbwelt',
    note: 'Basisfarbe, Rampe, Kontrast',
    minutes: '~9 Min',
    sessions: [
      { id: 'h.base', label: 'Basisfarbe', effort: '~2 Min' },
      { id: 'h.ramp', label: 'Hell-/Dunkel-Rampe', effort: '~1 Min' },
      { id: 'h.neutral', label: 'Grundton', effort: '~1 Min' },
      { id: 'h.accent', label: 'Akzent', effort: '~1 Min' },
      { id: 'h.roles', label: 'Rollen', effort: '~2 Min' },
      { id: 'h.contrast', label: 'Kontrast-Prüfung', effort: '~2 Min' },
    ],
  },
  {
    key: 'type',
    label: 'Typografie',
    note: 'Schriftpaar, Hierarchie, Regeln',
    minutes: '~6 Min',
    sessions: [
      { id: 'i.pair', label: 'Schriftpaar', effort: '~2 Min' },
      { id: 'i.scale', label: 'Hierarchie', effort: '~2 Min' },
      { id: 'i.rules', label: 'Schrift-Regeln', effort: '~2 Min' },
    ],
  },
  {
    key: 'mark',
    label: 'Zeichen',
    note: 'Richtung, Briefing, Setzungen',
    minutes: '~10 Min',
    sessions: [
      { id: 'j.kind', label: 'Richtung', effort: '~2 Min' },
      { id: 'j.brief', label: 'Briefing', effort: '~3 Min' },
      { id: 'j.examples', label: 'Gesetzte Beispiele', effort: '~2 Min' },
      { id: 'j.drafts', label: 'KI-Entwürfe', effort: '~3 Min' },
    ],
  },
  {
    key: 'imagery',
    label: 'Bildsprache',
    note: 'Bild-Prinzipien, Illustration, Icons',
    minutes: '~7 Min',
    sessions: [
      { id: 'k.photo', label: 'Bild-Prinzipien', effort: '~2 Min' },
      { id: 'k.illustration', label: 'Illustration', effort: '~1 Min' },
      { id: 'k.icons', label: 'Icons', effort: '~2 Min' },
      { id: 'k.dodont', label: 'Do & Don’t', effort: '~2 Min' },
    ],
  },
  {
    key: 'motion',
    label: 'Bewegung',
    note: 'Tempo, Übergänge, kinetisches Zeichen',
    minutes: '~5 Min',
    sessions: [
      { id: 'l.tempo', label: 'Tempo', effort: '~1 Min' },
      { id: 'l.transitions', label: 'Übergänge', effort: '~1 Min' },
      { id: 'l.logo', label: 'Kinetisches Zeichen', effort: '~1 Min' },
      { id: 'l.rules', label: 'Bewegungs-Regeln', effort: '~2 Min' },
    ],
  },
]

export function dsChapter(key: DsChapterKey): DsChapter {
  const found = DS_CHAPTERS.find(chapter => chapter.key === key)
  /* Nicht-null erzwungen statt optional gemacht: die sechs Schlüssel sind der
   * Typ, ein Fehlgriff wäre ein Tippfehler und kein Laufzeitfall. */
  return found ?? DS_CHAPTERS[0]!
}

/** Die Route eines Kapitels — an EINER Stelle, Rail und Seiten lesen sie. */
export function dsChapterPath(key: DsChapterKey): string {
  return `/brand/demo/design/${key}`
}

// ── Kapitel `dna`: die Visual DNA (§2.2) ───────────────────────────────────

export interface DsDnaValue {
  id: string
  label: string
}

export interface DsDnaDimension {
  id: string
  label: string
  /** Was die Dimension überhaupt entscheidet — eine Zeile, kein Absatz. */
  hint: string
  values: readonly DsDnaValue[]
}

/**
 * ZEHN ORTHOGONALE DIMENSIONEN (Davids Notiz 2026-08-30) mit KONTROLLIERTEN
 * Werten — ein Moodboard ist eine Belegung aller zehn, keine Kategorie.
 * Freitext gibt es bewusst nicht: was hier steht, muss später ein Preset
 * belegen können.
 */
export const DS_DNA_DIMENSIONS: readonly DsDnaDimension[] = [
  {
    id: 'style',
    label: 'Visueller Stil',
    hint: 'Die Grundhaltung der Gestaltung.',
    values: [
      { id: 'minimal', label: 'Minimal' },
      { id: 'editorial', label: 'Redaktionell' },
      { id: 'organic', label: 'Organisch' },
      { id: 'technical', label: 'Technisch' },
      { id: 'playful', label: 'Verspielt' },
    ],
  },
  {
    id: 'era',
    label: 'Ästhetische Epoche',
    hint: 'Aus welcher Zeit die Formen sprechen.',
    values: [
      { id: 'timeless', label: 'Zeitlos' },
      { id: 'midcentury', label: 'Mid-Century' },
      { id: 'print90', label: '90er-Print' },
      { id: 'digital', label: 'Gegenwärtig-digital' },
      { id: 'craft', label: 'Handwerklich-historisch' },
    ],
  },
  {
    id: 'form',
    label: 'Formsprache',
    hint: 'Kanten, Rundungen, Rhythmus.',
    values: [
      { id: 'soft', label: 'Weich gerundet' },
      { id: 'geometric', label: 'Geometrisch' },
      { id: 'sharp', label: 'Kantig' },
      { id: 'irregular', label: 'Unregelmäßig' },
      { id: 'mixed', label: 'Gemischt' },
    ],
  },
  {
    id: 'typography',
    label: 'Typografie-Charakter',
    hint: 'Wie die Schrift klingt, bevor man sie liest.',
    values: [
      { id: 'bookish', label: 'Buchhafte Serif' },
      { id: 'humanist', label: 'Humanistische Grotesk' },
      { id: 'geometricType', label: 'Geometrische Grotesk' },
      { id: 'mono', label: 'Schreibmaschine' },
      { id: 'contrast', label: 'Kontrastreich gemischt' },
    ],
  },
  {
    id: 'color',
    label: 'Farb-Charakter',
    hint: 'Temperatur, Sättigung, Tiefe.',
    values: [
      { id: 'earthy', label: 'Erdig gedämpft' },
      { id: 'airy', label: 'Hell und luftig' },
      { id: 'deep', label: 'Tief und kontrastreich' },
      { id: 'monochrome', label: 'Monochrom' },
      { id: 'vivid', label: 'Farbenfroh' },
    ],
  },
  {
    id: 'imagery',
    label: 'Bildwelt',
    hint: 'Was auf einem Bild passiert.',
    values: [
      { id: 'documentary', label: 'Dokumentarisch' },
      { id: 'still', label: 'Inszeniert-still' },
      { id: 'craftClose', label: 'Nah am Handwerk' },
      { id: 'people', label: 'Menschenzentriert' },
      { id: 'abstract', label: 'Abstrakt' },
    ],
  },
  {
    id: 'composition',
    label: 'Komposition',
    hint: 'Wie viel Luft die Fläche bekommt.',
    values: [
      { id: 'calm', label: 'Ruhig und luftig' },
      { id: 'dense', label: 'Dicht redaktionell' },
      { id: 'grid', label: 'Streng gerastert' },
      { id: 'asymmetric', label: 'Asymmetrisch' },
      { id: 'centered', label: 'Zentriert' },
    ],
  },
  {
    id: 'materiality',
    label: 'Materialität',
    hint: 'Woran sich die Oberfläche anfühlt.',
    values: [
      { id: 'paper', label: 'Papier, matt' },
      { id: 'smooth', label: 'Glatt-digital' },
      { id: 'textile', label: 'Textil, rau' },
      { id: 'wood', label: 'Holz, warm' },
      { id: 'glass', label: 'Glas, klar' },
    ],
  },
  {
    id: 'motion',
    label: 'Bewegungs-Charakter',
    hint: 'Wie sich Übergänge anfühlen.',
    values: [
      { id: 'calmMotion', label: 'Ruhig' },
      { id: 'springy', label: 'Federnd' },
      { id: 'precise', label: 'Präzise' },
      { id: 'none', label: 'Fast keine' },
      { id: 'playfulMotion', label: 'Verspielt' },
    ],
  },
  {
    id: 'mood',
    label: 'Grundstimmung',
    hint: 'Das Gefühl, das bleibt.',
    values: [
      { id: 'honest', label: 'Ehrlich-nüchtern' },
      { id: 'warm', label: 'Warm einladend' },
      { id: 'focused', label: 'Konzentriert' },
      { id: 'confident', label: 'Souverän' },
      { id: 'light', label: 'Leicht' },
    ],
  },
]

/** Eine Belegung: Dimensions-Id → Wert-Id (alle zehn, nie Teilmenge). */
export type DsDnaValues = Record<string, string>

export type DsDnaOrigin = 'foundation' | 'inspiration' | 'both'

export interface DsDnaProposalEntry {
  dimension: string
  value: string
  /** Die Herleitung aus der Foundation — das PRODUKT, nicht die Wahl selbst. */
  reason: string
  /**
   * HERKUNFT (§2.2 Leitplanke e): Foundation, Vorbild oder beides. Auf dem
   * Weg OHNE Vorbilder gilt für jede Zeile `foundation` — `inspirationReason`
   * wird dann nicht gezeigt. Eine Zeile kommt NIE allein aus einem Vorbild
   * ohne Foundation-Bezug: die Foundation ist der Maßstab, nicht das Bild.
   */
  origin: DsDnaOrigin
  /** Der Satz, der auf ein Vorbild zeigt („wie in Bild 3, aber wärmer"). */
  inspirationReason?: string
}

/** Fridas Vorschlag für Kailua, je Dimension mit Begründung (§2.2 `g.dna`). */
export const DS_DNA_PROPOSAL: readonly DsDnaProposalEntry[] = [
  { dimension: 'style', value: 'editorial', reason: 'Die Herkunftstafel ist euer Kernstück — eine Marke, die etwas ERKLÄRT, braucht redaktionelle Ruhe statt Werbe-Optik.', origin: 'both', inspirationReason: 'Vorbild 1 zeigt genau diese Haltung: Text zuerst, Bild als Beleg.' },
  { dimension: 'era', value: 'craft', reason: 'Anbau, Röstung und Ausschank in einer Hand: das ist Handwerk, kein Start-up-Versprechen.', origin: 'foundation' },
  { dimension: 'form', value: 'soft', reason: 'Zum Archetyp „Der Weise" mit Rest Schöpfer passt Milde in den Kanten — kantig wäre der Rebell.', origin: 'foundation' },
  { dimension: 'typography', value: 'bookish', reason: 'Ton-Wort „fundiert": eine buchhafte Serif in den Überschriften trägt Wissen, ohne laut zu werden.', origin: 'both', inspirationReason: 'Wie in Vorbild 2 — aber eine Stufe leichter im Schnitt, die Tafel ist kein Buchtitel.' },
  { dimension: 'color', value: 'earthy', reason: 'Roast, Crema, Milk — eure Palette kommt aus dem Produkt selbst, nicht aus einer Farbmode.', origin: 'both', inspirationReason: 'Vorbild 1 bestätigt die Erdtöne; das Neon-Grün aus Vorbild 4 bleibt draußen (Lesung: Spannung).' },
  { dimension: 'imagery', value: 'craftClose', reason: 'Wert „Nähe": Hände, Tafel, Maschine — nie Stock-Lächeln (Foundation, Kapitel 06).', origin: 'both', inspirationReason: 'Vorbild 5 trifft es fast — nur näher ran, das Detail soll das Bild füllen.' },
  { dimension: 'composition', value: 'calm', reason: 'Tagline „One honest, quiet moment a day" — Ruhe muss auf der Fläche sichtbar sein, sonst ist sie Behauptung.', origin: 'foundation', inspirationReason: 'Gegen Vorbild 4: dessen Dichte widerspricht dem Ton-Wort „ruhig" (Lesung: passt nicht).' },
  { dimension: 'materiality', value: 'paper', reason: 'Die Tafel wird jede Saison neu geschrieben: Papier, matt, mit Spuren — kein Hochglanz.', origin: 'foundation' },
  { dimension: 'motion', value: 'calmMotion', reason: 'Aus dem Ton-Wort „ruhig": langsamere Übergänge, kein Federn, kein Zappeln.', origin: 'foundation' },
  { dimension: 'mood', value: 'honest', reason: 'Wert „Klartext": lieber nüchtern und überprüfbar als warm und ungenau.', origin: 'both', inspirationReason: 'Vorbild 3 ist wärmer, als eure Werte hergeben — die Wärme bleibt in der Farbe, nicht im Ton.' },
]

export interface DsBoard {
  id: string
  name: string
  /** Ein Satz, was dieses Board anders macht als der Vorschlag. */
  note: string
  values: DsDnaValues
  /** Die Farbwelt-Skizze: Basisfarbe + Akzent aus der Kailua-Palette. */
  base: string
  accent: string
  fontPairId: string
}

/* Der Vorschlag als Belegung — DS_BOARDS[0] ist genau er. */
const PROPOSED: DsDnaValues = Object.fromEntries(
  DS_DNA_PROPOSAL.map(entry => [entry.dimension, entry.value]),
)

/**
 * DREI BOARDS — „wie vorgeschlagen", „eine Stufe ruhiger", „eine Stufe
 * mutiger" (§2.2 `g.boards`, PURE Regel ohne KI-Aufruf). Alle drei belegen
 * dieselben zehn Dimensionen; sie unterscheiden sich in vier bis fünf.
 */
export const DS_BOARDS: readonly DsBoard[] = [
  {
    id: 'proposed',
    name: 'Wie vorgeschlagen',
    note: 'Fridas Ableitung aus eurer Foundation — redaktionell, erdig, ruhig.',
    values: { ...PROPOSED },
    base: DS_BRAND.palette.roast,
    accent: DS_BRAND.palette.palm,
    fontPairId: 'editorial',
  },
  {
    id: 'calmer',
    name: 'Eine Stufe ruhiger',
    note: 'Weniger Wärme, mehr Weiß: Grün als Grund, humanistische Grotesk statt Serif, monochromere Flächen.',
    values: {
      ...PROPOSED,
      style: 'minimal',
      typography: 'humanist',
      color: 'monochrome',
      materiality: 'smooth',
      mood: 'focused',
    },
    base: DS_BRAND.palette.palm,
    accent: DS_BRAND.palette.crema,
    fontPairId: 'humanist',
  },
  {
    id: 'bolder',
    name: 'Eine Stufe mutiger',
    note: 'Crema als tragende Fläche, kontrastreiche Schriftmischung, dichtere Komposition — auffälliger, riskanter.',
    values: {
      ...PROPOSED,
      style: 'editorial',
      era: 'print90',
      form: 'mixed',
      typography: 'contrast',
      composition: 'dense',
      mood: 'confident',
    },
    base: DS_BRAND.palette.crema,
    accent: DS_BRAND.palette.roast,
    fontPairId: 'contrast',
  },
]

/** Menschlicher Name eines DNA-Werts („Redaktionell") — für Listen und Chips. */
export function dsDnaLabel(dimensionId: string, valueId: string): string {
  const dimension = DS_DNA_DIMENSIONS.find(d => d.id === dimensionId)
  return dimension?.values.find(v => v.id === valueId)?.label ?? valueId
}

// ── Kapitel `dna`, die zweite Quelle: Vorbilder und ihre Lesung (§2.2) ─────

/**
 * VORBILDER (Davids Entscheidung 2026-09-08): „Niemand fängt mit der Palette
 * an — vor Farbe und Schrift steht immer eine Richtung, aus der Strategie UND
 * aus Vorbildern." Der Kunde lädt Screenshots hoch, je Bild EIN Bereich, die
 * KI liest sie GEGEN die Foundation.
 *
 * DIE BILDER SIND ATTRAPPEN: abstrakte Kompositionen (`FdInspirationThumb`),
 * keine echten Screenshots fremder Marken — ein Klickdummy, der fremde
 * Websites zeigt, wäre schon das Urheberrechts-Problem, vor dem die
 * Leitplanke (a) im Konzept warnt. Die Form des Bereichs ist trotzdem
 * vollständig: Zähler, Bereich-Chip, Notiz, Fremdwerk-Hinweis, Privatheit.
 */
export type DsInspirationArea = 'color' | 'type' | 'mark' | 'imagery' | 'composition'

export const DS_INSPIRATION_AREAS: readonly { id: DsInspirationArea, label: string }[] = [
  { id: 'color', label: 'Farbwelt' },
  { id: 'type', label: 'Typografie' },
  { id: 'mark', label: 'Zeichen' },
  { id: 'imagery', label: 'Bildsprache' },
  { id: 'composition', label: 'Komposition' },
]

export function dsAreaLabel(area: DsInspirationArea): string {
  return DS_INSPIRATION_AREAS.find(entry => entry.id === area)?.label ?? area
}

export interface DsInspiration {
  id: string
  /** Laufende Nummer in der Anzeige („Vorbild 3") — die Lesung zeigt darauf. */
  number: number
  /** Was der Kunde hochgeladen hat (Dateiname, wie er ankommt). */
  filename: string
  area: DsInspirationArea
  /** Der optionale Satz des Kunden: warum es gefällt. */
  note: string
  /** Welche Attrappe gezeichnet wird. */
  kind: 'site' | 'palette' | 'type' | 'mark' | 'photo'
  /** Die Farben der Attrappe — Fremdfarben sind hier ERLAUBT: es sind ja Vorbilder. */
  colors: readonly string[]
}

export const DS_INSPIRATIONS: readonly DsInspiration[] = [
  { id: 'v1', number: 1, filename: 'roesterei-startseite.png', area: 'composition', note: 'Ruhig, viel Weißraum, Text zuerst — so wollen wir wirken.', kind: 'site', colors: ['#f4efe6', '#3b2a20', '#8c6a4a', '#5b6b52'] },
  { id: 'v2', number: 2, filename: 'buch-verlag-typo.png', area: 'type', note: 'Die Serif in den Überschriften, sehr souverän.', kind: 'type', colors: ['#faf7f1', '#1f1a16', '#b5895a'] },
  { id: 'v3', number: 3, filename: 'cafe-instagram.jpg', area: 'color', note: 'Warm und einladend, die Farben mögen wir sehr.', kind: 'palette', colors: ['#e2b07a', '#c2653a', '#f3dcc2', '#6e3b25', '#fbf4ea'] },
  { id: 'v4', number: 4, filename: 'specialty-brand-shop.png', area: 'mark', note: 'Das Zeichen: knallig, jung, fällt auf.', kind: 'mark', colors: ['#111111', '#b7ff3c', '#ffffff'] },
  { id: 'v5', number: 5, filename: 'farm-fotos.jpg', area: 'imagery', note: 'Echte Menschen bei der Arbeit, kein Studio.', kind: 'photo', colors: ['#7a6a55', '#c9b08a', '#3f4a38', '#efe6d6'] },
]

/** Die Drossel des Bereichs (§2.2 Leitplanke d) — wie bei den KI-Entwürfen als Zeile sichtbar. */
export const DS_INSPIRATION_LIMITS = 'Bis 12 Bilder je Lauf · 3 Läufe je Tag · 2 übrig'

export const DS_INSPIRATION_PRIVACY = 'Eure Vorbilder bleiben privat: sie erscheinen weder im Dokument noch im geteilten Link noch im Beispiel. Sie sind Fremdwerke — wir lesen sie, wir bauen sie nicht nach.'

/**
 * DIE LESUNG (§2.2 `g.reading`): je Bild eine strukturierte Belegung in der
 * DNA-Sprache plus das Urteil GEGEN die Foundation — `fits` (trägt schon),
 * `tension` (Spannung, mit Vorschlag, was man übernimmt) oder `off`
 * (widerspricht). JEDES Urteil nennt seine Foundation-Stelle: das ist
 * Davids „Verbesserungsvorschläge ODER sagen, was bereits sehr gut ist".
 */
export type DsReadingVerdict = 'fits' | 'tension' | 'off'

export interface DsReading {
  inspirationId: string
  /** Was das Bild zeigt — zwei bis drei DNA-Belegungen. */
  observed: readonly { dimension: string, value: string }[]
  verdict: DsReadingVerdict
  /** Die Foundation-Stelle, an der gemessen wurde („Wert „Klartext\""). */
  anchor: string
  /** Die Begründung — bei `fits`, was daran gut funktioniert. */
  reason: string
  /** Bei `tension`/`off`: was man übernimmt und was nicht. */
  suggestion?: string
}

export const DS_READINGS: readonly DsReading[] = [
  {
    inspirationId: 'v1',
    observed: [{ dimension: 'composition', value: 'calm' }, { dimension: 'style', value: 'editorial' }, { dimension: 'color', value: 'earthy' }],
    verdict: 'fits',
    anchor: 'Tagline „One honest, quiet moment a day" · Ton-Wort „ruhig"',
    reason: 'Text vor Bild, Weißraum als Haltung, keine Werbe-Optik: das ist eure Positionierung, schon gestaltet. Der Vorschlag übernimmt Komposition und Stil daraus.',
  },
  {
    inspirationId: 'v2',
    observed: [{ dimension: 'typography', value: 'bookish' }, { dimension: 'era', value: 'timeless' }],
    verdict: 'fits',
    anchor: 'Ton-Wort „fundiert" · Archetyp „Der Weise"',
    reason: 'Eine buchhafte Serif trägt Wissen, ohne laut zu werden — genau, was der Weise braucht. Ich schlage sie für die Überschriften vor, eine Stufe leichter im Schnitt: eure Tafel ist kein Buchtitel.',
  },
  {
    inspirationId: 'v3',
    observed: [{ dimension: 'color', value: 'vivid' }, { dimension: 'mood', value: 'warm' }],
    verdict: 'tension',
    anchor: 'Wert „Klartext" · Ton-Wort „nüchtern"',
    reason: 'Die Wärme passt zu „Nähe" — aber diese Sättigung verkauft, statt zu erklären. Eure Werte sagen „lieber nüchtern und überprüfbar als warm und ungenau".',
    suggestion: 'Übernehmen: den warmen Grundton (er sitzt zwischen Crema und Milk). Nicht übernehmen: die Sättigung — die Wärme bleibt in der Farbe, nicht im Ton.',
  },
  {
    inspirationId: 'v4',
    observed: [{ dimension: 'color', value: 'vivid' }, { dimension: 'mood', value: 'confident' }, { dimension: 'form', value: 'geometric' }],
    verdict: 'off',
    anchor: 'Archetyp „Der Weise" · Ton-Wort „ruhig"',
    reason: 'Neon auf Schwarz, hart gesetzt: das ist der Rebell, nicht der Weise. Es fällt auf — aber es widerspricht drei Stellen eurer Foundation zugleich (Archetyp, Ton, Wert „Klartext").',
    suggestion: 'Nichts übernehmen. Wenn ihr auffallen wollt, ist das eine Frage an die Positionierung, nicht an die Farbe — ich gebe sie an George zurück.',
  },
  {
    inspirationId: 'v5',
    observed: [{ dimension: 'imagery', value: 'documentary' }, { dimension: 'materiality', value: 'paper' }],
    verdict: 'fits',
    anchor: 'Wert „Nähe" · Foundation, Kapitel 06 „nie Stock-Lächeln"',
    reason: 'Menschen bei der Arbeit, Tageslicht, nichts gestellt — das ist die Bild-Regel, die Kapitel 06 schon fordert. Ich schlage eine Stufe näher vor: Hände, Tafel, Maschine sollen das Bild füllen.',
  },
]

export const DS_READING_VERDICTS: Record<DsReadingVerdict, { label: string, icon: string, tone: 'confirmed' | 'draft' | 'stale' }> = {
  fits: { label: 'Trägt schon', icon: 'i-ph-check-circle-fill', tone: 'confirmed' },
  tension: { label: 'Spannung', icon: 'i-ph-warning-circle-fill', tone: 'draft' },
  off: { label: 'Passt nicht', icon: 'i-ph-x-circle-fill', tone: 'stale' },
}

/** Das Fazit der Lesung — zwei Listen, wie David es gesagt hat. */
export const DS_READING_SUMMARY = {
  keeps: [
    'Ruhige, redaktionelle Komposition — Text zuerst (Vorbild 1).',
    'Buchhafte Serif in den Überschriften (Vorbild 2).',
    'Dokumentarische Bilder von Menschen bei der Arbeit (Vorbild 5).',
  ],
  improves: [
    'Die Wärme aus Vorbild 3 in den Grundton nehmen, die Sättigung nicht.',
    'Das Zeichen aus Vorbild 4 nicht verfolgen — es widerspricht Archetyp und Ton.',
    'Bilder eine Stufe näher als Vorbild 5: das Detail füllt die Fläche.',
  ],
  run: 'Lauf 1 von 3 · 5 Bilder gelesen · 7. Sept. 2026, 15:41',
} as const

// ── Kapitel `color`: Farbwelt (§2.3) ───────────────────────────────────────

export interface DsColorCandidate {
  id: string
  name: string
  hex: string
  reason: string
}

/** Drei Basisfarben-Kandidaten aus DNA „Farb-Charakter" + Archetyp. */
export const DS_BASE_CANDIDATES: readonly DsColorCandidate[] = [
  { id: 'roast', name: 'Roast', hex: DS_BRAND.palette.roast, reason: 'Die Farbe des Produkts nach der Röstung — tief genug, um Text zu tragen, warm genug für „Nähe".' },
  { id: 'palm', name: 'Palm', hex: DS_BRAND.palette.palm, reason: 'Der Ort statt des Produkts: Oʻahu-Grün, ruhiger als Braun, aber weiter weg von der Tasse.' },
  { id: 'crema', name: 'Crema', hex: DS_BRAND.palette.crema, reason: 'Die Wärme der Crema als tragende Farbe — die freundlichste der drei, und die hellste.' },
]

export interface DsNeutralOption {
  id: string
  label: string
  /** Aus welchem Farbton die Neutral-Ramp getönt wird. */
  source: string
  note: string
}

export const DS_NEUTRAL_OPTIONS: readonly DsNeutralOption[] = [
  { id: 'tinted', label: 'Aus der Basisfarbe getönt', source: DS_BRAND.palette.roast, note: 'Flächen tragen einen Hauch der Marke — die Vorgabe der Engine.' },
  { id: 'warm', label: 'Warm (Crema-Ton)', source: DS_BRAND.palette.crema, note: 'Papierfarben mit Gelbstich, wie ungestrichenes Papier.' },
  { id: 'cool', label: 'Kühl (Palm-Ton)', source: DS_BRAND.palette.palm, note: 'Ruhiger, technischer — nimmt der Wärme etwas Süße.' },
]

export const DS_ACCENT_CANDIDATES: readonly DsColorCandidate[] = [
  { id: 'palm', name: 'Palm', hex: DS_BRAND.palette.palm, reason: 'Ausreichend weit von Roast entfernt, um als Signal zu lesen — und trotzdem aus eurer Welt.' },
  { id: 'crema', name: 'Crema', hex: DS_BRAND.palette.crema, reason: 'Verwandt statt kontrastierend: ein Akzent, der nie schreit.' },
  { id: 'milk', name: 'Milk', hex: DS_BRAND.palette.milk, reason: 'Nur als Fläche brauchbar — als Signalfarbe zu hell.' },
]

export interface DsColorRole {
  id: string
  label: string
  /** Woraus die Rolle gefüllt wird (Ramp-Stufe oder Palettenname). */
  source: string
  note: string
}

export const DS_COLOR_ROLES: readonly DsColorRole[] = [
  { id: 'ground', label: 'Grund & Text', source: 'Ramp 900 auf Papier', note: 'Alles Gelesene. Nie die 500er-Stufe — die ist Fläche, nicht Schrift.' },
  { id: 'surface', label: 'Wärme & Flächen', source: 'Ramp 100/200', note: 'Karten, Einschübe, Tabellen-Zebra.' },
  { id: 'light', label: 'Helle Flächen', source: 'Neutral 50', note: 'Der Papierton der Seite.' },
  { id: 'accent', label: 'Akzent & Signal', source: 'Akzentfarbe', note: 'Knöpfe, aktive Zustände, genau ein Pop je Fläche.' },
  { id: 'quiet', label: 'Papier & Ruhe', source: 'Paper #f7f2ea', note: 'Der Grund, auf dem alles liegt — im Druck wie am Bildschirm.' },
]

/**
 * Die Text/Grund-Paare der Kontrast-Matrix (§2.3 `h.contrast`).
 *
 * ZWEI QUELLEN, DAMIT DIE PAARE STIMMEN: eine Zahl im VORDERGRUND ist eine
 * Stufe der Marken-Ramp (Text trägt die Marke), eine Zahl im HINTERGRUND eine
 * Stufe der Neutral-Ramp (Flächen tragen sie nicht). Wer das vertauscht, misst
 * Paare, die auf keiner Seite vorkommen.
 */
export interface DsContrastPair {
  id: string
  label: string
  /** 'light' | 'dark' — in welcher Welt das Paar geprüft wird. */
  scheme: 'light' | 'dark'
  fgShade: Shade | 'accent' | 'paper'
  bgShade: Shade | 'paper' | 'ground' | 'accent'
}

export const DS_CONTRAST_PAIRS: readonly DsContrastPair[] = [
  { id: 'body-light', label: 'Fließtext auf Papier', scheme: 'light', fgShade: 900, bgShade: 'paper' },
  { id: 'heading-light', label: 'Überschrift auf Papier', scheme: 'light', fgShade: 800, bgShade: 'paper' },
  { id: 'button-light', label: 'Knopf-Text auf Akzent', scheme: 'light', fgShade: 'paper', bgShade: 'accent' },
  { id: 'muted-light', label: 'Nebentext auf Fläche', scheme: 'light', fgShade: 700, bgShade: 100 },
  { id: 'body-dark', label: 'Fließtext auf dunklem Grund', scheme: 'dark', fgShade: 100, bgShade: 'ground' },
  { id: 'accent-dark', label: 'Akzent auf dunklem Grund', scheme: 'dark', fgShade: 400, bgShade: 'ground' },
]

// ── Kapitel `type`: Schriftpaare (§2.4) ────────────────────────────────────

export interface DsFontPair {
  id: string
  name: string
  headingFamily: string
  headingStack: string
  bodyFamily: string
  bodyStack: string
  note: string
}

/**
 * DER KATALOG: die fünf kuratierten Paare aus docs/referenz/
 * THEMES-CONCEPT-V2.md §3.5 plus das eine Paar des G4-Katalogs
 * (`bold-contrast`, Sora + Inter), das dort kein Gegenstück hat.
 *
 * FALLE (§2.17): die Familien müssen im CSS des Playgrounds DEKLARIERT sein
 * (`app/assets/css/demo-fonts.css`), sonst self-hostet `@nuxt/fonts` sie
 * nicht und die Vorschau fällt still auf den Systemstack zurück — sie sähe
 * dann aus wie G4 („eine Richtung, kein Rendering-Beweis"), obwohl sie hier
 * genau das Gegenteil beweisen soll.
 */
export const DS_FONT_PAIRS: readonly DsFontPair[] = [
  {
    id: 'editorial',
    name: 'Redaktionell',
    headingFamily: 'Source Serif 4',
    headingStack: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    bodyFamily: 'Source Sans 3',
    bodyStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    note: 'Serif oben, Grotesk unten — die Buch-Anmutung, die zu „fundiert" gehört.',
  },
  {
    id: 'humanist',
    name: 'Humanistisch',
    headingFamily: 'Source Sans 3',
    headingStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Source Sans 3',
    bodyStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    note: 'Eine Familie, zwei Rollen: ruhig, unaufdringlich, überall lesbar.',
  },
  {
    id: 'inter',
    name: 'Neutral',
    headingFamily: 'Inter',
    headingStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Inter',
    bodyStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    note: 'Die Arbeitsschrift des Netzes — sagt nichts über euch, stört aber auch nie.',
  },
  {
    id: 'geometric',
    name: 'Geometrisch',
    headingFamily: 'Sora',
    headingStack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Nunito Sans',
    bodyStack: "'Nunito Sans', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif",
    note: 'Konstruierte Formen — moderner, aber weiter weg vom Handwerk.',
  },
  {
    id: 'classic',
    name: 'Klassisch',
    headingFamily: 'PT Serif',
    headingStack: "'PT Serif', Georgia, 'Times New Roman', serif",
    bodyFamily: 'PT Sans',
    bodyStack: "'PT Sans', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif",
    note: 'Amtlich-solide: gut für Institutionen, etwas streng für eine Rösterei.',
  },
  {
    id: 'contrast',
    name: 'Kontrastreich',
    headingFamily: 'Sora',
    headingStack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Inter',
    bodyStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    note: 'Aus dem G4-Katalog (Richtung „Mutig & Kontrastreich") — laut, aber wach.',
  },
]

export function dsFontPair(id: string): DsFontPair {
  return DS_FONT_PAIRS.find(pair => pair.id === id) ?? DS_FONT_PAIRS[0]!
}

/** Die Mono-Rolle ist FIX (Themes-Regel „maximal drei Schriften"). */
export const DS_MONO_STACK = "'Geist Mono', ui-monospace, SFMono-Regular, monospace"

export interface DsTypeScaleOption {
  id: string
  label: string
  note: string
  /** Verhältnis H1 : Fließtext — die Hierarchie in einer Zahl. */
  ratio: string
}

export const DS_TYPE_SCALES: readonly DsTypeScaleOption[] = [
  { id: 'calm', label: 'Ruhig', note: 'Wenige Größen, viel Zeilenabstand — der Vorschlag aus DNA „ruhig und luftig".', ratio: '1 : 2,6' },
  { id: 'dense', label: 'Dicht', note: 'Redaktionell: kleinere Sprünge, mehr Text je Bildschirm.', ratio: '1 : 2,0' },
  { id: 'loud', label: 'Plakativ', note: 'Große Sprünge — gut für Kampagnen, unruhig im Handbuch.', ratio: '1 : 3,4' },
]

// ── Kapitel `mark`: das Zeichen in drei Stufen (§2.5) ──────────────────────

export interface DsMarkKind {
  id: 'word' | 'pictorial' | 'combination' | 'monogram'
  label: string
  reason: string
  recommended?: boolean
}

export const DS_MARK_KINDS: readonly DsMarkKind[] = [
  { id: 'word', label: 'Wortmarke', reason: 'Euer Name IST die Aussage („Kailua" ist der Ort). Eine Wortmarke braucht keine Erklärung und altert am langsamsten.', recommended: true },
  { id: 'pictorial', label: 'Bildmarke', reason: 'Ein Zeichen ohne Namen wirkt erst nach vielen Kontakten — für eine junge Rösterei mit einem Laden teuer erkauft.' },
  { id: 'combination', label: 'Kombination', reason: 'Wortmarke plus Zeichen: flexibel, aber zwei Dinge, die gepflegt werden wollen.' },
  { id: 'monogram', label: 'Monogramm', reason: 'Das „K" als Avatar und App-Icon — als HAUPTzeichen zu wenig, als Variante Pflicht.' },
]

export interface DsMarkBrief {
  character: string
  formLanguage: string
  clearSpace: string
  variants: string
  noGos: string
  places: string
}

/** Das Briefing (§2.5 Stufe 1, `j.brief`) — der Text, den ein Designer bekommt. */
export const DS_MARK_BRIEF: DsMarkBrief = {
  character: 'Ruhig, handwerklich, überprüfbar. Das Zeichen darf still sein — die Marke gewinnt über Wiederkehr, nicht über Auffälligkeit.',
  formLanguage: 'Weiche, gerundete Kanten; eine einzige Idee statt einer Szene. Keine Tasse, keine Bohne, kein Dampf — das Produkt steht ohnehin daneben.',
  clearSpace: 'Schutzraum ringsum = Höhe des Versal-K. Mindestbreite Wortmarke 96 px digital, 24 mm im Druck; Monogramm nie unter 24 px.',
  variants: 'Primär (Roast auf Paper), invertiert (Paper auf Roast), einfarbig Schwarz, Icon-Fläche (Monogramm auf Roast, quadratisch mit Schutzraum).',
  noGos: 'Nicht verzerren, nicht schräg stellen, keinen Schatten, nicht auf unruhige Fotos setzen, nie neu setzen — das Zeichen ist eine Datei, kein Textfeld.',
  places: 'Ladenschild, Tüte, Tasse (Prägung, einfarbig), Website-Kopf, Instagram-Avatar (Monogramm), Rechnung.',
}

export interface DsMarkVariant {
  id: string
  label: string
  note: string
}

export const DS_MARK_VARIANTS: readonly DsMarkVariant[] = [
  { id: 'primary', label: 'Primär', note: 'Roast auf Paper — der Normalfall.' },
  { id: 'inverted', label: 'Invertiert', note: 'Paper auf Roast — dunkle Flächen, Tüte, Tasse.' },
  { id: 'mono', label: 'Einfarbig', note: 'Ein Ton, für Prägung, Stempel und Fax-Realität.' },
  { id: 'icon', label: 'Icon-Fläche', note: 'Monogramm im Quadrat — Avatar, App-Icon, Favicon.' },
]

/**
 * DIE VIER KI-ENTWÜRFE (§2.5 Stufe 3) — ATTRAPPEN.
 *
 * Jede Komposition ist von Hand aus Farbwelt und Formsprache gezeichnet
 * (viewBox 0 0 100 100); es gibt kein Bildmodell, keine Datei und keinen
 * Netzzugriff. Modellname, Datum und Prompt-Hash stehen trotzdem dran, weil
 * genau diese HERKUNFTS-Zeile die Leitplanke aus §1.11 b ist — sie muss im
 * Prototyp beurteilt werden können.
 */
export interface DsMarkDraft {
  id: string
  title: string
  model: string
  created: string
  promptHash: string
  /** Welche Komposition gezeichnet wird — die Seite kennt die vier Formen. */
  shape: 'arc' | 'ring' | 'seed' | 'grid'
  kept: boolean
}

export const DS_MARK_DRAFTS: readonly DsMarkDraft[] = [
  { id: 'd1', title: 'Bogen über Grundlinie', model: 'Bildmodell (Attrappe)', created: '7. Sept. 2026, 14:02', promptHash: 'a91f3c', shape: 'arc', kept: false },
  { id: 'd2', title: 'Offener Ring', model: 'Bildmodell (Attrappe)', created: '7. Sept. 2026, 14:02', promptHash: 'a91f3c', shape: 'ring', kept: false },
  { id: 'd3', title: 'Kern und Schale', model: 'Bildmodell (Attrappe)', created: '7. Sept. 2026, 14:02', promptHash: 'a91f3c', shape: 'seed', kept: false },
  { id: 'd4', title: 'Tafel-Raster', model: 'Bildmodell (Attrappe)', created: '7. Sept. 2026, 14:02', promptHash: 'a91f3c', shape: 'grid', kept: false },
]

export const DS_DRAFT_DISCLAIMER = 'Entwurf — Idee für die Designer-Arbeit, kein geprüftes Logo.'

export const DS_DRAFT_TRADEMARK_NOTE = 'Markenrecht: Ein Entwurf sagt nichts über Schutzfähigkeit oder Ähnlichkeit zu bestehenden Marken. Vor der Anmeldung prüft das eine Anwältin — wir prüfen es nicht.'

export const DS_DRAFT_QUOTA = '3 Läufe je Tag · 2 übrig'

// ── Kapitel `imagery`: Bildsprache & Ikonografie (§2.6) ────────────────────

export interface DsImageryPrinciple {
  id: string
  label: string
  reason: string
  /** Die vier Achsen aus §2.6 — sie stehen als Zeilen auf der Karte. */
  light: string
  crop: string
  people: string
  colorNote: string
  /** Die abstrahierte Komposition (KEINE Fotos, §1.4). */
  scene: 'daylight' | 'contrast' | 'closeup'
}

export const DS_IMAGERY_PRINCIPLES: readonly DsImageryPrinciple[] = [
  {
    id: 'daylight',
    label: 'Tageslicht, nichts gestellt',
    reason: 'Wert „Klartext": weiches Fensterlicht zeigt, was da ist — Studioblitz zeigt, was inszeniert wurde.',
    light: 'Weiches Seitenlicht, sichtbare Schatten, keine Aufheller.',
    crop: 'Weiter Ausschnitt, Raum um das Motiv.',
    people: 'Menschen bei der Arbeit, nie in die Kamera lächelnd.',
    colorNote: 'Erdtöne, entsättigt; Grün nur als Akzent.',
    scene: 'daylight',
  },
  {
    id: 'contrast',
    label: 'Dunkel und konzentriert',
    reason: 'Näher an „souverän" als an „ehrlich": starke Schatten, wenig Fläche — wirkt teurer, aber auch verschlossener.',
    light: 'Hartes Licht, tiefe Schatten, dunkler Grund.',
    crop: 'Enger Ausschnitt, viel Schwarz.',
    people: 'Nur Hände, nie Gesichter.',
    colorNote: 'Roast dominiert, Crema als einziges Licht.',
    scene: 'contrast',
  },
  {
    id: 'closeup',
    label: 'Nah am Handwerk',
    reason: 'Der Vorschlag: Textur statt Szene — Bohne, Sack, Tafel, Maschine. Zeigt das Versprechen, ohne es zu behaupten.',
    light: 'Diffus, gleichmäßig, ohne Drama.',
    crop: 'Sehr nah, Detail füllt das Bild.',
    people: 'Hände im Bild, Gesicht optional.',
    colorNote: 'Alle fünf Palettenfarben erlaubt, keine Fremdfarbe.',
    scene: 'closeup',
  },
]

export interface DsChoice {
  id: string
  label: string
  note: string
  recommended?: boolean
}

export const DS_ILLUSTRATION_OPTIONS: readonly DsChoice[] = [
  { id: 'none', label: 'Keine Illustration', note: 'Fotos und Typografie tragen alles — die einfachste Regel, die man nicht brechen kann.' },
  { id: 'line', label: 'Linie', note: 'Feine Konturzeichnungen für Herkunft und Ablauf — passt zur Tafel.', recommended: true },
  { id: 'area', label: 'Fläche', note: 'Farbflächen ohne Kontur — plakativ, näher an Verpackung als an Handbuch.' },
  { id: 'organic', label: 'Organisch', note: 'Gezeichnete, unregelmäßige Formen — warm, aber schwer konsistent zu halten.' },
]

export interface DsIconOption {
  id: string
  label: string
  note: string
  /** Der Phosphor-Suffix — die Vorschau zeigt ECHTE Icons, kein Bild davon. */
  suffix: '' | '-fill' | '-bold'
  recommended?: boolean
}

export const DS_ICON_OPTIONS: readonly DsIconOption[] = [
  { id: 'regular', label: 'Linie (regular)', note: 'Gleiche Strichstärke wie die Textschrift — ruhig, unauffällig.', suffix: '', recommended: true },
  { id: 'fill', label: 'Fläche (fill)', note: 'Gefüllt: gut lesbar auf kleinen Flächen, wirkt schwerer.', suffix: '-fill' },
  { id: 'bold', label: 'Kräftig (bold)', note: 'Dicker Strich — laut neben einer Serif.', suffix: '-bold' },
]

/** Die Icons der Vergleichsreihe (ohne Suffix — den setzt die Wahl). */
export const DS_ICON_SAMPLE = ['i-ph-coffee', 'i-ph-leaf', 'i-ph-map-pin', 'i-ph-scales', 'i-ph-clock'] as const

export const DS_IMAGERY_DODONT: readonly { doText: string, dontText: string }[] = [
  { doText: 'Hände, Werkzeug, Tafel — Arbeit im Bild.', dontText: 'Gestellte Gruppenbilder mit Daumen hoch.' },
  { doText: 'Tageslicht mit sichtbaren Schatten.', dontText: 'Weichzeichner, Lens Flare, HDR-Look.' },
  { doText: 'Ausschnitte, die Textur zeigen.', dontText: 'Stock-Fotos mit fremden Bechern.' },
  { doText: 'Erdtöne aus der Palette.', dontText: 'Farbfilter, die Roast ins Rote ziehen.' },
]

// ── Kapitel `motion`: Bewegung (§2.7) ──────────────────────────────────────

export interface DsTempoOption {
  id: string
  label: string
  note: string
  /** Grunddauer in ms — sie steuert die Übergangs-Tokens. */
  base: number
  easing: string
  recommended?: boolean
}

export const DS_TEMPO_OPTIONS: readonly DsTempoOption[] = [
  { id: 'calm', label: 'Ruhig', note: 'Aus DNA „Bewegungs-Charakter: ruhig" — langsam anlaufend, sanft ausklingend.', base: 240, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', recommended: true },
  { id: 'lively', label: 'Lebendig', note: 'Kürzer und mit leichtem Überschwingen — wach, aber unruhiger.', base: 180, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
  { id: 'snappy', label: 'Knapp', note: 'Fast ohne Anlauf: wirkt effizient, nimmt der Marke die Ruhe.', base: 120, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
]

export interface DsMotionToken {
  id: string
  label: string
  /** Wert relativ zur Grunddauer — die Tabelle rechnet ihn aus. */
  factor: number
  usage: string
}

export const DS_MOTION_TOKENS: readonly DsMotionToken[] = [
  { id: 'fast', label: 'motion.fast', factor: 0.5, usage: 'Hover, Fokus, kleine Zustände.' },
  { id: 'base', label: 'motion.base', factor: 1, usage: 'Karten, Einblendungen, Menüs.' },
  { id: 'slow', label: 'motion.slow', factor: 1.6, usage: 'Seitenwechsel, große Flächen.' },
]

/** Versatz zwischen Geschwistern (Listen, Karten) — in ms. */
export const DS_MOTION_STAGGER = 60

export const DS_MOTION_RULES: readonly string[] = [
  'Bewegung erklärt einen Zusammenhang oder sie entfällt — Dekoration bewegt sich nie.',
  'Nur zwei Eigenschaften gleichzeitig: Deckkraft und eine Verschiebung. Keine Rotation, keine Skalierung von Text.',
  'Das Zeichen bewegt sich nicht (§ kinetisches Zeichen: nein) — außer im Vorspann eines Videos.',
  'Bei `prefers-reduced-motion: reduce` bleibt der Endzustand sofort stehen; es gibt keine „reduzierte" Ersatz-Animation.',
]

export const DS_MOTION_LOGO_OPTIONS: readonly DsChoice[] = [
  { id: 'no', label: 'Nein — das Zeichen steht still', note: 'Passt zu „ruhig" und spart eine Datei, die niemand pflegt.', recommended: true },
  { id: 'yes', label: 'Ja — kinetisches Zeichen', note: 'Ein 800-ms-Aufbau für Videos und Ladeflächen; braucht eine eigene Datei und eine reduced-motion-Fassung.' },
]

// ── Frida: die Züge der rechten Spalte ─────────────────────────────────────

export interface DsAdvisorMove {
  id: string
  text: string
  /** Leise Mono-Zeile darunter (Herkunft, Hinweis) — nie eine zweite Frage. */
  help?: string
}

export const DS_ADVISOR = {
  name: 'Frida Martens',
  role: 'Design Directorin · Brand Design',
  initial: 'F',
  desc: 'Macht aus eurer Foundation eine Gestalt. Strategie-Fragen reicht sie an George zurück.',
  personal: 'Design Directorin — übersetzt Strategie in Gestalt und begründet jede Entscheidung am Fundament.',
} as const

/** Zwei bis drei Züge je Kapitel — sie BEGRÜNDEN den Vorschlag, mehr nicht. */
export const DS_ADVISOR_MOVES: Record<DsChapterKey, readonly DsAdvisorMove[]> = {
  dna: [
    { id: 'dna-0', text: 'Bevor ich etwas vorschlage: Habt ihr Vorbilder? Screenshots, ein Pinterest-Board, drei Websites, die euch gefallen — je Bild sagt ihr mir nur, WAS daran (Farbe, Schrift, Zeichen, Bild). Ich lese sie gegen eure Foundation und sage euch, was davon schon trägt und was besser geht.', help: 'Ohne Vorbilder geht es direkt zum Vorschlag — die Foundation reicht.' },
    { id: 'dna-1', text: 'Ich habe eure Foundation gelesen, nicht eure Branche — und eure Vorbilder an ihr gemessen, nicht umgekehrt. Der Vorschlag unten hängt an vier Stellen: Archetyp „Der Weise", Wert „Klartext", Ton-Wort „ruhig" und der Herkunftstafel; jede Zeile sagt, ob sie aus der Foundation, einem Vorbild oder beidem kommt.' },
    { id: 'dna-2', text: 'Drei Boards, nicht dreißig: einmal genau so, einmal eine Stufe ruhiger, einmal eine Stufe mutiger. Wählt eines als Ausgangspunkt — und nehmt euch danach einzelne Eigenschaften aus den anderen.', help: 'Festgehaltene Eigenschaften bleiben beim Neu-Vorschlagen stehen.' },
    { id: 'dna-3', text: 'Wenn ihr euch zwischen „ruhiger" und „mutiger" nicht entscheiden könnt, ist das kein Geschmacksproblem: dann steht in eurer Positionierung noch beides. Sagt es mir, ich gebe die Frage an George zurück.' },
  ],
  color: [
    { id: 'color-1', text: 'Die Basisfarbe ist die einzige Farbe, die ihr wirklich wählt — alles andere rechne ich daraus: elf Stufen hell, elf Stufen dunkel, dazu die getönten Flächen.' },
    { id: 'color-2', text: 'Crema steht bewusst mit in der Liste, obwohl sie durchfällt. Als Fläche ist sie schön; als Textfarbe auf Papier reißt sie AA — und eine Marke, deren Preisliste niemand lesen kann, hat kein Design-Problem, sondern ein Klartext-Problem.', help: 'Kontrast-Urteil nach WCAG 2.1, gerechnet aus den Hex-Werten.' },
    { id: 'color-3', text: 'Der Akzent ist ein Signal, kein Zweitgrund: ein Pop je Fläche. Wenn ihr ihn überall seht, ist er keiner mehr.' },
  ],
  type: [
    { id: 'type-1', text: 'Sechs Paare, echte Schriften — hier fällt keine Entscheidung gegen einen Systemfallback. Was ihr seht, sieht euer Kunde auch.' },
    { id: 'type-2', text: 'Mein Vorschlag ist „Redaktionell": Serif oben, Grotesk unten. Die Serif trägt „fundiert", ohne dass ihr laut werden müsst — und die Grotesk hält die Preisliste ruhig.' },
    { id: 'type-3', text: 'Mono bleibt fix und gehört den Herkunftsangaben und Preisen. Das ist keine dritte Marke, sondern eine Rolle.', help: 'Themes-Regel: nie mehr als drei Schriften auf einer Seite.' },
  ],
  mark: [
    { id: 'mark-1', text: 'Drei Stufen, in dieser Reihenfolge: erst die Richtung mit Briefing, dann gesetzte Beispiele aus eurem Schriftpaar, dann die KI-Entwürfe. Wer bei den Bildern anfängt, bekommt ein Logo ohne Begründung.' },
    { id: 'mark-2', text: 'Die Setzungen unten sind ECHT gerechnet: Schriftpaar, Farbwelt, Schutzraum. Sie sind keine Vorschläge für ein fertiges Logo, sondern der Beweis, dass euer Name auch ohne Zeichen steht.' },
    { id: 'mark-3', text: 'Die KI-Entwürfe sind Ideen für die Designer-Arbeit — nicht euer Logo. Sie tragen ihre Herkunft, bleiben privat und reisen weder in den Snapshot noch in den geteilten Link.', help: 'Markenrechtliche Prüfung macht eine Anwältin, nicht dieses Werkzeug.' },
  ],
  imagery: [
    { id: 'imagery-1', text: 'Bildsprache sind Regeln, keine Bilder. Ihr entscheidet über Licht, Ausschnitt, Menschen und Farbigkeit — daraus wird der Satz, den ihr eurer Fotografin schickt.' },
    { id: 'imagery-2', text: 'Die Karten unten zeigen die Prinzipien als abstrahierte Kompositionen aus eurer Farbwelt. Bewusst keine Fotos: ein Stock-Bild würde die Entscheidung verkaufen, die ihr gerade trefft.' },
    { id: 'imagery-3', text: 'Beim Icon-Satz zähle ich nur eine Frage: passt die Strichstärke zur Textschrift? Alles andere ist Geschmack — und Geschmack ohne Begründung ist bei uns kein Argument.' },
  ],
  motion: [
    { id: 'motion-1', text: 'Bewegung ist der leiseste Teil eurer Marke und der erste, den man falsch macht. Aus „ruhig" folgt: langsamer anlaufen, sanft ausklingen, nie federn.' },
    { id: 'motion-2', text: 'Die drei Tokens unten sind die ganze Regel — schnell, normal, langsam, dazu ein Versatz für Listen. Mehr braucht niemand, und weniger Tokens heißt weniger Streit im Team.' },
    { id: 'motion-3', text: 'Und der Ernstfall: Wer im Betriebssystem weniger Bewegung eingestellt hat, bekommt den Endzustand sofort. Keine Ersatz-Animation, kein „halb so schnell".', help: 'Schalter unten simuliert prefers-reduced-motion.' },
  ],
}

// ── Freischaltung (§2.10, Screen 8) ────────────────────────────────────────

export type DsUnlockState = 'locked' | 'unlocked' | 'done'

export interface DsUnlockRow {
  id: string
  title: string
  path: string
  foundation: string
  unlocked: boolean
  /** Die Ereignis-Zeile nach der Freischaltung (`design.unlocked`). */
  event?: string
}

export const DS_UNLOCK_ROWS: readonly DsUnlockRow[] = [
  { id: 'kailua', title: 'Kailua Coffee Co.', path: 'Neue Marke', foundation: 'Foundation abgeschlossen · 7. Sept. 2026', unlocked: false },
  { id: 'hafenkontor', title: 'Hafenkontor', path: 'Neue Marke', foundation: 'Foundation abgeschlossen · 4. Sept. 2026', unlocked: true, event: 'design.unlocked · von P6 · 4. Sept. 2026' },
  { id: 'schubert', title: 'Schubert UX Studio', path: 'Marken-Relaunch', foundation: 'Foundation offen — 6 von 7 Kapiteln', unlocked: false },
]
