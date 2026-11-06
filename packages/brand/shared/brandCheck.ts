import type { BrandStepKey } from './slotRegistry'

/**
 * DER KATALOG UND DIE RECHNUNG DES BRAND-CHECKS (docs/archiv/BRAND-CHECK.md §3
 * und §4, Bewertungsmodell v2 aus BRAND-WIZARD-PHASE-1 „Brand Score") — pur,
 * ohne h3, ohne Appwrite, ohne Vue.
 *
 * ── WARUM DER KATALOG DATEN SIND UND KEIN CODE ────────────────────────────
 * Vierzig Kriterien in acht Kategorien sind ein FACHLICHER Text, kein
 * Programm. Als Datei kann David den Wortlaut nachschärfen, ohne dass jemand
 * eine Verzweigung anfasst — und der Prompt des Modells liest denselben
 * Wortlaut, den die Rechnung gewichtet. Wer die `rule` ändert, ändert damit
 * ausdrücklich auch, was das Modell gefragt wird; genau das ist gewollt.
 *
 * ── DIE REGELN SIND ENGLISCH, DIE ÜBERSCHRIFTEN NICHT HIER ────────────────
 * `rule` ist PROMPT-MATERIAL und geht wörtlich an das Modell — deshalb
 * Englisch, wie jeder andere Prompt im Layer. Die MENSCHLICHEN Titel und die
 * „nächsten Schritte" leben als i18n-Schlüssel im Client
 * (`brand.check.criteria.<id>.title|next`): eine Ergebnis-Seite spricht die
 * Sprache ihres Lesers, ein Prompt die des Modells. Ein zweisprachiger
 * Katalog hier wäre eine dritte Übersetzungsstelle neben de.json und en.json.
 *
 * ── ZWEI SORTEN, EINE RECHNUNG ────────────────────────────────────────────
 * `kind: 'measured'` wird deterministisch aus dem HTML gerechnet
 * (`server/utils/brandCheckMeasure.ts`), `kind: 'judged'` beurteilt das Modell
 * in EINEM Aufruf (`server/utils/brandCheckJudge.ts`). Für die Rechnung hier
 * ist der Unterschied bedeutungslos — sie kennt nur 0, 1, 2 und `null`.
 *
 * ── `null` HEISST „NICHT BEWERTBAR", NIE „NULL PUNKTE" ────────────────────
 * Das ist der Kern von „stufen-bewusst" (Plan §3): was von aussen nicht
 * prüfbar ist oder wozu das Modell keine gültige Antwort geliefert hat, fällt
 * aus der Normalisierung heraus statt als 0 zu zählen. Eine Kategorie ohne
 * EINEN bewertbaren Wert ist `locked` und zählt weder im Zähler noch im
 * Nenner — sonst bestrafte der Gesamtwert das Fehlen einer Messung.
 */

// ── Die acht Kategorien ────────────────────────────────────────────────────

export type BrandCheckCategoryKey
  = 'distinctiveness'
    | 'visual'
    | 'consistency'
    | 'experience'
    | 'clarity'
    | 'emotion'
    | 'adaptability'
    | 'craft'

export interface BrandCheckCategory {
  key: BrandCheckCategoryKey
  /** Punkte am Gesamtwert. Die Summe aller acht ist 100 (Test-Invariante). */
  weight: number
}

/**
 * Reihenfolge = Plan-Reihenfolge A–H. Sie ist die Anzeigeordnung der
 * Ergebnis-Seite UND der Tiebreak der Befund-Auswahl — deshalb steht sie hier
 * fest und wird nirgends sortiert.
 */
export const BRAND_CHECK_CATEGORIES: readonly BrandCheckCategory[] = [
  { key: 'distinctiveness', weight: 15 },
  { key: 'visual', weight: 15 },
  { key: 'consistency', weight: 15 },
  { key: 'experience', weight: 15 },
  { key: 'clarity', weight: 10 },
  { key: 'emotion', weight: 10 },
  { key: 'adaptability', weight: 10 },
  { key: 'craft', weight: 10 },
] as const

/** Höchstpunktzahl EINES Kriteriums — fünf davon ergeben den Rohwert 0–10. */
export const BRAND_CHECK_CRITERION_MAX = 2

/** Kriterien je Kategorie. Fest, weil `raw` (0–10) daran hängt. */
export const BRAND_CHECK_CRITERIA_PER_CATEGORY = 5

// ── Die vierzig Kriterien ──────────────────────────────────────────────────

export type BrandCheckCriterionKind = 'measured' | 'judged'

export interface BrandCheckCriterion {
  /** `<kategorie-buchstabe><1..5>` — stabil, sie steht in gespeicherten Zeilen. */
  id: string
  category: BrandCheckCategoryKey
  kind: BrandCheckCriterionKind
  /** Die 0/1/2-Regel, wörtlich so, wie sie das Modell zu sehen bekommt. */
  rule: string
  maxScore: 2
}

const MAX = BRAND_CHECK_CRITERION_MAX as 2

/**
 * DIE VIERZIG — in Plan-Reihenfolge, fünf je Kategorie.
 *
 * SECHZEHN sind messbar, VIERUNDZWANZIG beurteilt. Der Plan schreibt an einer
 * Stelle „17 messbar, 23 beurteilt"; massgeblich sind die M/K-Buchstaben an
 * den Kriterien selbst, und die ergeben 16/24 (B 3 · C 2 · D 3 · E 1 · G 3 ·
 * H 4). Die Zusammenfassung im Plan ist um eins verzählt, nicht der Katalog.
 */
export const BRAND_CHECK_CRITERIA: readonly BrandCheckCriterion[] = [
  // ── A · Eigenständigkeit (15) ────────────────────────────────────────────
  {
    id: 'a1',
    category: 'distinctiveness',
    kind: 'judged',
    rule: 'The opening sentence says something only this brand could say. 0 = interchangeable, 1 = industry-typical but with something of its own, 2 = genuinely its own.',
    maxScore: MAX,
  },
  {
    id: 'a2',
    category: 'distinctiveness',
    kind: 'judged',
    rule: 'The name and/or claim is unmistakable and not a generic term. 0 = a generic term, 1 = partly generic, 2 = unmistakable.',
    maxScore: MAX,
  },
  {
    id: 'a3',
    category: 'distinctiveness',
    kind: 'judged',
    rule: 'No filler vocabulary ("innovative", "holistic", "premium") in the hero and the introduction. 0 = three or more fillers, 1 = one or two, 2 = none.',
    maxScore: MAX,
  },
  {
    id: 'a4',
    category: 'distinctiveness',
    kind: 'judged',
    rule: 'A recognisable point of view or stance is put into words. 0 = none, 1 = hinted at, 2 = clearly stated.',
    maxScore: MAX,
  },
  {
    id: 'a5',
    category: 'distinctiveness',
    kind: 'judged',
    rule: 'Imagery and metaphors are the brand\'s own rather than stock motifs (judge from alt texts, captions and headings). 0 = pure stock, 1 = mixed, 2 = its own.',
    maxScore: MAX,
  },

  // ── B · Visuelle Identität (15) ──────────────────────────────────────────
  {
    id: 'b1',
    category: 'visual',
    kind: 'measured',
    rule: 'A favicon and an og:image are present. 0 = neither, 1 = one of them, 2 = both.',
    maxScore: MAX,
  },
  {
    id: 'b2',
    category: 'visual',
    kind: 'measured',
    rule: 'Consistent heading hierarchy: exactly one h1, with h2 following it. 0 = no h1 or several h1, 1 = one h1 but level jumps, 2 = clean.',
    maxScore: MAX,
  },
  {
    id: 'b3',
    category: 'visual',
    kind: 'judged',
    rule: 'Images and alt texts describe a recognisable visual world (not "image1.jpg"). 0 = missing or meaningless, 1 = partly descriptive, 2 = a recognisable visual world.',
    maxScore: MAX,
  },
  {
    id: 'b4',
    category: 'visual',
    kind: 'measured',
    rule: 'Colour and theme metadata are set (theme-color, color-scheme). 0 = neither, 1 = one of them, 2 = both.',
    maxScore: MAX,
  },
  {
    id: 'b5',
    category: 'visual',
    kind: 'judged',
    rule: 'Words and imagery fit together (the tone of the copy matches the motifs that are described). 0 = they contradict each other, 1 = partly, 2 = coherent.',
    maxScore: MAX,
  },

  // ── C · Konsistenz (15) ──────────────────────────────────────────────────
  {
    id: 'c1',
    category: 'consistency',
    kind: 'judged',
    rule: 'One tone across the whole page (the form of address and the register stay stable). 0 = mixed, 1 = mostly stable, 2 = one tone.',
    maxScore: MAX,
  },
  {
    id: 'c2',
    category: 'consistency',
    kind: 'measured',
    rule: 'title, og:title and the h1 say the same thing. 0 = they contradict each other, 1 = partly, 2 = congruent.',
    maxScore: MAX,
  },
  {
    id: 'c3',
    category: 'consistency',
    kind: 'judged',
    rule: 'The promise in the hero matches what the rest of the page describes. 0 = no, 1 = partly, 2 = yes.',
    maxScore: MAX,
  },
  {
    id: 'c4',
    category: 'consistency',
    kind: 'measured',
    rule: 'The language is declared and consistent (the lang attribute matches the text). 0 = missing or wrong, 1 = declared but only partly matching, 2 = declared and matching.',
    maxScore: MAX,
  },
  {
    id: 'c5',
    category: 'consistency',
    kind: 'judged',
    rule: 'The brand name is written consistently (capitalisation, abbreviations). 0 = several spellings, 1 = minor deviations, 2 = consistent.',
    maxScore: MAX,
  },

  // ── D · Markenerlebnis (15) ──────────────────────────────────────────────
  {
    id: 'd1',
    category: 'experience',
    kind: 'measured',
    rule: 'There is a clear call to action (a link or button carrying a verb, near the top of the page). 0 = none, 1 = present but without a verb, 2 = present and carrying a verb.',
    maxScore: MAX,
  },
  {
    id: 'd2',
    category: 'experience',
    kind: 'judged',
    rule: 'The next step for a visitor is unambiguous (one main action instead of five). 0 = unclear, 1 = several competing actions, 2 = one clear action.',
    maxScore: MAX,
  },
  {
    id: 'd3',
    category: 'experience',
    kind: 'measured',
    rule: 'Findability basics: title 30-65 characters, meta description 70-160 characters. 0 = both missing or out of range, 1 = one of them right, 2 = both right.',
    maxScore: MAX,
  },
  {
    id: 'd4',
    category: 'experience',
    kind: 'measured',
    rule: 'GEO readiness: structured data (JSON-LD Organization or WebSite) is present. 0 = no JSON-LD, 1 = JSON-LD but neither Organization nor WebSite, 2 = Organization or WebSite present.',
    maxScore: MAX,
  },
  {
    id: 'd5',
    category: 'experience',
    kind: 'judged',
    rule: 'Contact and trust are visible (imprint, contact or about reachable, a real sender). 0 = nothing of that kind, 1 = partly, 2 = clearly.',
    maxScore: MAX,
  },

  // ── E · Positionierung & Klarheit (10) ───────────────────────────────────
  {
    id: 'e1',
    category: 'clarity',
    kind: 'judged',
    rule: 'Understandable within ten seconds: WHAT is offered. 0 = unclear, 1 = can be inferred, 2 = immediately clear.',
    maxScore: MAX,
  },
  {
    id: 'e2',
    category: 'clarity',
    kind: 'judged',
    rule: 'FOR WHOM it is - the audience is named or unmistakable. 0 = not recognisable, 1 = can be inferred, 2 = named.',
    maxScore: MAX,
  },
  {
    id: 'e3',
    category: 'clarity',
    kind: 'judged',
    rule: 'The purpose or core sentence is short and active (at most 20 words, an active verb). 0 = missing or bloated, 1 = present but long or passive, 2 = short and active.',
    maxScore: MAX,
  },
  {
    id: 'e4',
    category: 'clarity',
    kind: 'judged',
    rule: 'Differentiation: an "unlike others" is recognisable without badmouthing competitors. 0 = none, 1 = hinted at, 2 = clear and fair.',
    maxScore: MAX,
  },
  {
    id: 'e5',
    category: 'clarity',
    kind: 'measured',
    rule: 'Low jargon density: the share of words with 14 or more characters in the hero and the introduction. 0 = more than 12 percent, 1 = 6 to 12 percent, 2 = less than 6 percent.',
    maxScore: MAX,
  },

  // ── F · Emotionale Wirkung (10) ──────────────────────────────────────────
  {
    id: 'f1',
    category: 'emotion',
    kind: 'judged',
    rule: 'The page speaks to a feeling, not only to a feature. 0 = features only, 1 = hinted at, 2 = clearly.',
    maxScore: MAX,
  },
  {
    id: 'f2',
    category: 'emotion',
    kind: 'judged',
    rule: 'There is a story or an origin (why this brand exists). 0 = none, 1 = hinted at, 2 = told.',
    maxScore: MAX,
  },
  {
    id: 'f3',
    category: 'emotion',
    kind: 'judged',
    rule: 'A human voice instead of officialese (an I/we perspective, concrete images). 0 = officialese, 1 = mixed, 2 = human.',
    maxScore: MAX,
  },
  {
    id: 'f4',
    category: 'emotion',
    kind: 'judged',
    rule: 'A moment of surprise or idiosyncrasy (one line worth passing on). 0 = none, 1 = a hint of one, 2 = clearly there.',
    maxScore: MAX,
  },
  {
    id: 'f5',
    category: 'emotion',
    kind: 'judged',
    rule: 'The tone fits the category (no sales pitch for a club, no officialese for a cafe). 0 = does not fit, 1 = partly, 2 = fits.',
    maxScore: MAX,
  },

  // ── G · Anpassungsfähigkeit (10) ─────────────────────────────────────────
  {
    id: 'g1',
    category: 'adaptability',
    kind: 'measured',
    rule: 'A mobile viewport is set. 0 = missing, 2 = set. (No middle grade.)',
    maxScore: MAX,
  },
  {
    id: 'g2',
    category: 'adaptability',
    kind: 'measured',
    rule: 'Dark mode readiness (a color-scheme declaration or prefers-color-scheme in the head). 0 = neither, 1 = one of them, 2 = both.',
    maxScore: MAX,
  },
  {
    id: 'g3',
    category: 'adaptability',
    kind: 'judged',
    rule: 'The core message works as a one-liner (the title or og:title carries it on its own). 0 = no, 1 = partly, 2 = yes.',
    maxScore: MAX,
  },
  {
    id: 'g4',
    category: 'adaptability',
    kind: 'measured',
    rule: 'The social preview is complete (og:title, og:description and og:image). 0 = none or one of them, 1 = two, 2 = all three.',
    maxScore: MAX,
  },
  {
    id: 'g5',
    category: 'adaptability',
    kind: 'judged',
    rule: 'The brand language works in short AND long formats (buttons and labels share the tone of the paragraphs). 0 = no, 1 = partly, 2 = yes.',
    maxScore: MAX,
  },

  // ── H · Handwerk (10) ────────────────────────────────────────────────────
  {
    id: 'h1',
    category: 'craft',
    kind: 'measured',
    rule: 'Spelling and punctuation: double spaces, broken umlaut encoding, leftover escaped entities. 0 = three or more findings, 1 = one or two, 2 = none.',
    maxScore: MAX,
  },
  {
    id: 'h2',
    category: 'craft',
    kind: 'measured',
    rule: 'No placeholder text ("Lorem ipsum", "your text here", "TODO"). 0 = found, 2 = none. (No middle grade.)',
    maxScore: MAX,
  },
  {
    id: 'h3',
    category: 'craft',
    kind: 'measured',
    rule: 'HTTPS, and a request to the plain http address ends up on https. 0 = no, 2 = yes. (No middle grade.)',
    maxScore: MAX,
  },
  {
    id: 'h4',
    category: 'craft',
    kind: 'judged',
    rule: 'Sentences in the hero are at most 25 words long and not nested. 0 = long nested sentences, 1 = mixed, 2 = short and clear.',
    maxScore: MAX,
  },
  {
    id: 'h5',
    category: 'craft',
    kind: 'measured',
    rule: 'Meta hygiene: no duplicate title, the description appears only once, a canonical is set. 0 = none of the three, 1 = one or two, 2 = all three.',
    maxScore: MAX,
  },
] as const

/**
 * DIE FASSUNG DER RECHNUNG. Sie steht in jeder gespeicherten Zeile, damit ein
 * Ergebnis von heute morgen später noch erklärbar ist: ändert sich der Katalog
 * oder eine Gewichtung, ändert sich diese Zeichenkette — und ein alter Wert
 * behauptet nicht mehr, nach den neuen Regeln entstanden zu sein.
 */
export const BRAND_CHECK_SCORE_VERSION = 'score-1'

/** Alle Kriterien EINER Kategorie, in Katalog-Reihenfolge. */
export function brandCheckCriteriaOf(category: BrandCheckCategoryKey): BrandCheckCriterion[] {
  return BRAND_CHECK_CRITERIA.filter(criterion => criterion.category === category)
}

/** Ein bekanntes Kriterium — oder `null`. Nie geraten (fremde Ids fallen raus). */
export function brandCheckCriterionById(id: string): BrandCheckCriterion | null {
  return BRAND_CHECK_CRITERIA.find(criterion => criterion.id === id) ?? null
}

// ── Der Cache-Schlüssel ────────────────────────────────────────────────────

/** Deckel des Schlüssels = die Spaltengrösse `brand_checks.urlKey`. */
export const BRAND_CHECK_URL_KEY_MAX = 600

/** Wie lange ein Ergebnis für dieselbe Adresse gilt (Plan §2 und §5). */
export const BRAND_CHECK_CACHE_MS = 7 * 24 * 60 * 60_000

/**
 * WAS „DIESELBE ADRESSE" HEISST: Host und Pfad, kleingeschrieben — ohne Query
 * und ohne Fragment.
 *
 * ── WARUM DIE QUERY WEGFÄLLT ──────────────────────────────────────────────
 * `?utm_source=newsletter` beschreibt, WOHER jemand kam, nicht WELCHE Seite er
 * meint. Bliebe sie im Schlüssel, hätte jede Kampagne ihren eigenen
 * Zwischenspeicher — und der 7-Tage-Deckel, der die KI-Kosten begrenzen soll,
 * wäre mit einem angehängten Fragezeichen aushebelbar.
 *
 * Das SCHEMA fällt ebenfalls weg (`http` und `https` derselben Seite sind
 * dieselbe Marke), der abschliessende `/` wird abgeschnitten, und `www.` bleibt
 * bewusst STEHEN: ob eine Marke auf `www` oder ohne verweist, ist eine
 * Entscheidung ihres Betreibers — zwei Adressen zusammenzuziehen, die
 * verschieden ausliefern KÖNNEN, wäre geraten.
 *
 * Eine unlesbare Adresse ergibt `''`; die Route prüft vorher mit demselben
 * Schema, das der Client benutzt, also kann das hier nur ein Programmierfehler
 * sein — und `''` als Schlüssel findet nichts, statt irgendetwas zu finden.
 */
export function brandCheckUrlKey(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  }
  catch {
    return ''
  }
  const host = url.host.toLowerCase()
  if (!host) return ''
  const path = url.pathname.replace(/\/+$/, '').toLowerCase()
  return `${host}${path}`.slice(0, BRAND_CHECK_URL_KEY_MAX)
}

// ── Die Bänder ─────────────────────────────────────────────────────────────

export type BrandScoreBand
  = 'exceptional'
    | 'outstanding'
    | 'excellent'
    | 'strong'
    | 'average'
    | 'weak'
    | 'poor'

/**
 * DIE SIEBEN, ALS LISTE — in absteigender Stärke, also in der Reihenfolge, in
 * der ein Filter sie anbietet.
 *
 * Sie ist die WAHRHEIT über die erlaubten Werte der Spalte `brand_checks.band`
 * und wird gebraucht, seit das Ranking nach ihnen filtert
 * (`?band=strong`): ein Filterwert aus einer Adresszeile muss gegen etwas
 * geprüft werden, und `brandScoreBand()` prüft nicht, es rechnet.
 */
export const BRAND_SCORE_BANDS: readonly string[] = [
  'exceptional',
  'outstanding',
  'excellent',
  'strong',
  'average',
  'weak',
  'poor',
]

/**
 * DIE SIEBEN BÄNDER aus dem Bewertungsmodell v2 (94+ · 88–93 · 80–87 · 70–79 ·
 * 60–69 · 50–59 · <50) — als TABELLE, absteigend, mit der UNTERGRENZE jedes
 * Bandes. Sie sind REIFEGRAD, kein Zeugnis; die Wörter dazu liegen beim
 * Client, hier steht nur die Grenze.
 *
 * ── WARUM DIE ZAHLEN SEIT DER METHODIK-SEITE DATEN SIND (BS1 R2a) ─────────
 * `/brand-check/methodik` sagt öffentlich zu, ab welchem Wert welches Band
 * gilt. Stünden die Grenzen nur als sieben `if`-Zeilen da, müsste die Seite
 * sie abtippen — und eine abgetippte Grenze ist beim ersten Verschieben eine
 * öffentliche Falschaussage über die eigene Rechnung. Die Funktion LIEST
 * jetzt dieselbe Tabelle, die die Seite rendert; es gibt keine zweite Wahrheit
 * mehr, die auseinanderlaufen könnte.
 */
export interface BrandScoreBandRange {
  band: BrandScoreBand
  /** Ab diesem Wert (einschliesslich) gilt das Band. Das letzte trägt 0. */
  min: number
}

export const BRAND_SCORE_BAND_RANGES: readonly BrandScoreBandRange[] = [
  { band: 'exceptional', min: 94 },
  { band: 'outstanding', min: 88 },
  { band: 'excellent', min: 80 },
  { band: 'strong', min: 70 },
  { band: 'average', min: 60 },
  { band: 'weak', min: 50 },
  { band: 'poor', min: 0 },
] as const

export function brandScoreBand(score: number): BrandScoreBand {
  for (const range of BRAND_SCORE_BAND_RANGES) {
    if (score >= range.min) return range.band
  }
  // Unerreichbar, solange der letzte Eintrag 0 trägt — ein negativer Wert
  // (den `computeBrandCheck` nie erzeugt) landet hier statt in `undefined`.
  return 'poor'
}

// ── Die Rechnung ───────────────────────────────────────────────────────────

/** 0, 1, 2 — oder `null` für „nicht bewertbar" (s. Kopf). */
export type BrandCheckScoreValue = 0 | 1 | 2 | null

/** Kriterium-Id → Wert. Fehlende Schlüssel gelten wie `null`. */
export type BrandCheckScores = Record<string, BrandCheckScoreValue>

export interface BrandCheckCategoryComputation {
  key: BrandCheckCategoryKey
  weight: number
  /** Summe der bewertbaren Kriterien, 0–10. */
  raw: number
  /** Wie viele der fünf Kriterien bewertbar waren. */
  assessable: number
  /** `weight × raw / (assessable × 2)`, auf zwei Stellen gerundet. 0 bei `locked`. */
  points: number
  /** Kein einziges bewertbares Kriterium ⇒ die Kategorie zählt nirgends mit. */
  locked: boolean
}

export interface BrandCheckComputation {
  /** 0–100, ganzzahlig. */
  score: number
  band: BrandScoreBand
  categories: BrandCheckCategoryComputation[]
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * DER GESAMTWERT — über die FREIGESCHALTETEN Gewichte normalisiert.
 *
 * ── WARUM NICHT EINFACH raw/10 × weight ───────────────────────────────────
 * Weil vier von fünf Kriterien einer Kategorie `null` sein können. Ein
 * Nenner von 10 rechnete die fehlenden Messungen dann als Nullen, und eine
 * Marke verlöre Punkte für etwas, das wir gar nicht angesehen haben. Normiert
 * wird deshalb auf `assessable × 2` — die Punkte, die überhaupt zu holen waren.
 *
 * ── UND WARUM DER NENNER OBEN AUCH SCHRUMPFT ──────────────────────────────
 * Eine `locked`-Kategorie fällt aus BEIDEN Seiten des Bruchs. Bliebe ihr
 * Gewicht im Nenner, wäre der Gesamtwert automatisch gedeckelt (bei zwei
 * gesperrten Kategorien à 15 gäbe es nie mehr als 70) — das wäre eine Note für
 * die Grenzen des Aussen-Checks, nicht für die Marke.
 *
 * Gerechnet wird der Gesamtwert aus den UNGERUNDETEN Punkten; gerundet wird
 * erst, was angezeigt wird. Andersherum summierten sich acht Rundungsfehler.
 */
export function computeBrandCheck(scores: BrandCheckScores): BrandCheckComputation {
  let earned = 0
  let available = 0

  const categories = BRAND_CHECK_CATEGORIES.map((category): BrandCheckCategoryComputation => {
    const criteria = brandCheckCriteriaOf(category.key)
    let raw = 0
    let assessable = 0
    for (const criterion of criteria) {
      const value = scores[criterion.id]
      if (value === 0 || value === 1 || value === 2) {
        raw += value
        assessable += 1
      }
    }

    if (assessable === 0) {
      return { key: category.key, weight: category.weight, raw: 0, assessable: 0, points: 0, locked: true }
    }

    const points = category.weight * (raw / (assessable * BRAND_CHECK_CRITERION_MAX))
    earned += points
    available += category.weight

    return {
      key: category.key,
      weight: category.weight,
      raw,
      assessable,
      points: roundTo(points, 2),
      locked: false,
    }
  })

  // Nichts bewertbar ⇒ 0. Ein „nicht messbar" als 100 zu lesen wäre die
  // freundlichste und unehrlichste aller Antworten; der Client zeigt daneben
  // acht Schlösser und erklärt es.
  const score = available > 0 ? Math.round((earned / available) * 100) : 0

  return { score, band: brandScoreBand(score), categories }
}

// ── Die drei Befunde ───────────────────────────────────────────────────────

/**
 * WAS EIN VERLORENER PUNKT KOSTET: das Gewicht der Kategorie geteilt durch die
 * fünf Kriterien, mal die Punkte bis zur 2. Ein fehlender Punkt in der
 * Eigenständigkeit (15/5 = 3) wiegt damit anderthalb Mal so schwer wie einer
 * im Handwerk (10/5 = 2) — genau die Gewichtung, die auch der Gesamtwert
 * benutzt, nur je Kriterium ausgerechnet.
 */
export function brandCheckWeightedGap(criterionId: string, value: BrandCheckScoreValue): number {
  if (value === null || value === undefined) return 0
  const criterion = brandCheckCriterionById(criterionId)
  if (!criterion) return 0
  const category = BRAND_CHECK_CATEGORIES.find(entry => entry.key === criterion.category)
  if (!category) return 0
  const perPoint = category.weight / BRAND_CHECK_CRITERIA_PER_CATEGORY
  return (BRAND_CHECK_CRITERION_MAX - value) * perPoint
}

/**
 * DIE DREI WICHTIGSTEN BEFUNDE (Plan §4) — die Kriterien mit dem grössten
 * gewichteten Abstand zur 2.
 *
 * NICHT BEWERTBARES kommt NICHT vor: ein `null` ist keine Schwäche, sondern
 * eine Grenze unserer Messung, und „verbessern Sie etwas, das wir nicht
 * ansehen konnten" ist kein nächster Schritt.
 *
 * EINE ZWEI IST AUCH KEIN BEFUND. Wer überall die volle Punktzahl hat,
 * bekommt eine LEERE Liste statt drei Lobeshymnen im Befund-Gewand — der
 * Block heisst „was als Nächstes hilft", und dort nichts zu haben ist eine
 * Aussage. Bei Gleichstand entscheidet die Katalog-Reihenfolge (stabil, also
 * bei gleicher Eingabe immer dasselbe Ergebnis).
 */
export function pickBrandCheckFindings(scores: BrandCheckScores, limit = 3): string[] {
  return BRAND_CHECK_CRITERIA
    .map((criterion, index) => ({
      id: criterion.id,
      index,
      gap: brandCheckWeightedGap(criterion.id, scores[criterion.id] ?? null),
    }))
    .filter(entry => entry.gap > 0)
    .sort((a, b) => (b.gap - a.gap) || (a.index - b.index))
    .slice(0, Math.max(0, limit))
    .map(entry => entry.id)
}

// ── Die Kategorie-Werte, vergleichbar gemacht ──────────────────────────────

/**
 * DIE ACHT KATEGORIEN AUF 0–100 — die eine Umrechnung, mit der zwei
 * Kategorien (und zwei Checks) überhaupt nebeneinander stehen dürfen.
 *
 * `points` aus der gespeicherten Rechnung wäre der falsche Wert dafür: er
 * trägt das GEWICHT (Eigenständigkeit geht bis 15, Handwerk bis 10) — eine 9
 * neben einer 9 hiesse dort zweierlei. Gerechnet wird der Anteil der
 * ERREICHBAREN Punkte, also dieselbe Normalisierung, die auch der Gesamtwert
 * benutzt, nur je Kategorie.
 *
 * `locked` (kein einziges bewertbares Kriterium) wird `null` und NICHT 0:
 * „konnten wir nicht ansehen" ist keine schwache Kategorie. Genau davon lebt
 * die Gegenüberstellung — ein `null` gegen eine 60 ist kein Absturz, sondern
 * eine fehlende Messung.
 *
 * Sie steht HIER und nicht in der Ranking-Route, seit ein zweiter Leser
 * dazugekommen ist (der Verlauf einer Brand): dieselbe Zahl, zweimal
 * gerechnet, wäre zweimal eine Gelegenheit, verschieden zu runden.
 */
export interface BrandCheckCategoryLike {
  key: string
  raw: number
  assessable: number
  locked: boolean
}

export interface BrandCheckCategoryScore {
  id: string
  score: number | null
}

export function brandCheckCategoryScores(
  categories: readonly Partial<BrandCheckCategoryLike>[],
): BrandCheckCategoryScore[] {
  return categories
    .filter(entry => !!entry && typeof entry.key === 'string')
    .map((entry) => {
      const assessable = typeof entry.assessable === 'number' ? entry.assessable : 0
      const raw = typeof entry.raw === 'number' ? entry.raw : 0
      const locked = entry.locked === true || assessable <= 0
      return {
        id: entry.key as string,
        score: locked ? null : Math.round((raw / (assessable * BRAND_CHECK_CRITERION_MAX)) * 100),
      }
    })
}

// ── Die Experten-To-dos ────────────────────────────────────────────────────

/**
 * WELCHES WIZARD-KAPITEL EIN KRITERIUM ADRESSIERT — und wo bewusst KEINES steht.
 *
 * Der Check misst einen AUFTRITT, der Wizard baut ein FUNDAMENT; beides deckt
 * sich nur zur Hälfte. Vier Kategorien haben ein Kapitel, in dem genau diese
 * Frage gestellt wird:
 *  · Eigenständigkeit und Positionierung ⇒ `pvm` (Purpose · Vision · Mission
 *    · Positionierung) — dort entstehen der erste Satz, der Standpunkt und die
 *    Abgrenzung.
 *  · Konsistenz und emotionale Wirkung ⇒ `archetype` (Archetyp & Stimme) —
 *    dort entstehen Ton, Vokabular und die Stimme, die eine Seite trägt.
 *
 * Die vier anderen (visuelle Identität, Markenerlebnis, Anpassungsfähigkeit,
 * Handwerk) bekommen `''`, und das ist eine AUSSAGE: ein fehlendes Favicon,
 * ein fehlender Viewport oder ein doppelter `title` sind Umsetzung, kein
 * Fundament — ein Link ins Kapitel „Werte" wäre dort ein Versprechen, das der
 * Wizard nicht einlöst.
 *
 * Der Wert ist ein `BrandStepKey` (Typprüfung gegen die Registry) bzw. `''` —
 * eine erfundene Kapitel-Adresse führte im Dashboard auf eine 404.
 */
export const BRAND_CHECK_WIZARD_STEPS: Readonly<Record<BrandCheckCategoryKey, BrandStepKey | ''>> = {
  distinctiveness: 'pvm',
  clarity: 'pvm',
  consistency: 'archetype',
  emotion: 'archetype',
  visual: '',
  experience: '',
  adaptability: '',
  craft: '',
}

/** Das Kapitel eines KRITERIUMS (über seine Kategorie) — `''` = keines. */
export function brandCheckWizardStep(criterionId: string): BrandStepKey | '' {
  const criterion = brandCheckCriterionById(criterionId)
  return criterion ? BRAND_CHECK_WIZARD_STEPS[criterion.category] : ''
}

/** Ein Kriterium, so wie es in einer gespeicherten Zeile steht. */
export interface BrandCheckCriterionLike {
  id: string
  score: BrandCheckScoreValue
  evidence: string
  note: string
}

export interface BrandCheckTodo {
  criterionId: string
  category: BrandCheckCategoryKey
  /** 0 oder 1 — eine 2 ist kein To-do, ein `null` erst recht nicht. */
  score: 0 | 1
  evidence: string
  note: string
  /** Der gewichtete Abstand zur 2 — die Sortiergrösse, sichtbar gemacht. */
  gap: number
  /** Das Wizard-Kapitel oder `''` (s. `BRAND_CHECK_WIZARD_STEPS`). */
  wizardStep: BrandStepKey | ''
}

/**
 * „WAS DER EXPERTE JETZT ANGEHEN WÜRDE" (BRAND-CHECK-SEITE §5) — dieselbe
 * Regel wie die drei Befunde, nur OHNE Deckel.
 *
 * Wörtlich dieselbe: `brandCheckWeightedGap` sortiert, die Katalog-Reihenfolge
 * bricht Gleichstände, `null` kommt nicht vor. Eine zweite Rangfolge daneben
 * hiesse, dass die Ergebnis-Seite drei Punkte nennt und die To-do-Liste
 * darunter mit einem vierten anfängt.
 *
 * `null` FEHLT HIER AUS DEMSELBEN GRUND wie bei den Befunden: es ist keine
 * Schwäche, sondern eine Grenze unserer Messung — und beim Dokument-Check sind
 * das alle sechzehn gerechneten Kriterien. Stünden sie in der Liste, bestünde
 * die halbe To-do-Liste einer Brand ohne Website aus „Favicon anlegen".
 *
 * Die Eingabe ist die KRITERIEN-Liste eines gespeicherten Ergebnisses (sie
 * trägt Beleg und Notiz mit sich, `BrandCheckResult` passt strukturell) — nicht
 * die `scores`-Karte: ein To-do ohne Beleg wäre wieder das „gefühlt", gegen das
 * der ganze Check gebaut ist. Unbekannte Ids (Bestandsdaten eines älteren
 * Katalogs) fallen raus, statt ohne Gewicht ganz vorn zu landen.
 */
export function pickBrandCheckTodos(
  result: { criteria: readonly BrandCheckCriterionLike[] },
): BrandCheckTodo[] {
  const order = new Map(BRAND_CHECK_CRITERIA.map((criterion, index) => [criterion.id, index]))

  return result.criteria
    .filter(entry => entry.score === 0 || entry.score === 1)
    .map(entry => ({ entry, criterion: brandCheckCriterionById(entry.id) }))
    .filter((pair): pair is { entry: BrandCheckCriterionLike, criterion: BrandCheckCriterion } =>
      pair.criterion !== null)
    .map(({ entry, criterion }) => ({
      criterionId: entry.id,
      category: criterion.category,
      score: entry.score as 0 | 1,
      evidence: entry.evidence ?? '',
      note: entry.note ?? '',
      gap: brandCheckWeightedGap(entry.id, entry.score),
      wizardStep: BRAND_CHECK_WIZARD_STEPS[criterion.category],
    }))
    .sort((a, b) =>
      (b.gap - a.gap)
      || ((order.get(a.criterionId) ?? 0) - (order.get(b.criterionId) ?? 0)))
}

// ── Der Dokument-Check (BRAND-CHECK-SEITE §5b) ─────────────────────────────

/**
 * DIE FASSUNG DER DOKUMENT-RECHNUNG. Sie ist eine EIGENE (§5b: „damit
 * Website- und Dokument-Scores nie in einer Zahl verglichen werden") — nicht,
 * weil anders gerechnet würde (`computeBrandCheck` ist dieselbe Funktion),
 * sondern weil anderes GEMESSEN wird: sechzehn der vierzig Kriterien gibt es
 * an einem Dokument nicht, sie fallen als „nicht bewertbar" aus der
 * Normalisierung. Eine 78 aus dem Dokument und eine 78 aus der Website sagen
 * deshalb Verschiedenes, und die `scoreVersion` ist die einzige Stelle, an der
 * eine spätere Auswertung das noch erkennen kann.
 */
export const BRAND_CHECK_DOC_SCORE_VERSION = 'doc-score-1'

/**
 * DER ZWISCHENSPEICHER-SCHLÜSSEL EINES DOKUMENT-CHECKS.
 *
 * Er sieht aus wie eine Adresse und ist keine — genau deshalb trägt er das
 * Präfix `doc:`: ein `urlKey` besteht sonst aus Host und Pfad
 * (`brandCheckUrlKey`), und ein Doppelpunkt kann darin nie vorkommen. Damit
 * greift der Sieben-Tage-Zwischenspeicher JE BRAND, ohne dass ein
 * Dokument-Check je eine Website verdecken könnte (oder umgekehrt).
 */
export function brandCheckDocumentUrlKey(profileId: string): string {
  return `doc:${profileId}`.slice(0, BRAND_CHECK_URL_KEY_MAX)
}

/**
 * DIE ZEILE EINES DOKUMENT-CHECKS — pur, damit die REGEL prüfbar ist und nicht
 * nur die Route.
 *
 * Jede Spalte steht explizit da (CLAUDE.md, dieselbe Regel wie in
 * `check.post.ts`): eine neue Spalte soll eine Entscheidung an dieser Stelle
 * sein und kein stiller Default. Drei Werte sind dabei die eigentliche Aussage
 * dieses Checks und werden deshalb hier gesetzt und nicht vom Aufrufer:
 *
 *  · `source: 'document'` — die Quelle, an der die Ergebnis-Seite „Fundament-
 *    Dokument" statt einer Adresse zeigt.
 *  · `url: ''` — es gibt keine. Ein „Platzhalter" wie die Website der Brand
 *    wäre eine Adresse, die dieser Check nie gelesen hat.
 *  · `hidden: false` — ein frischer Check ist nie ausgeblendet; `hidden` ist
 *    die Antwort des Betreibers auf einen Entfernungswunsch.
 *
 * `host` trägt den MARKENNAMEN. Das ist bewusst dieselbe Spalte wie beim
 * Website-Check: sie beantwortet die Frage „worüber redet diese Zeile", und
 * eine zweite Spalte „name" hiesse, dass jede Liste künftig zwei Felder
 * abfragen muss, um eine Überschrift zu setzen.
 */
export interface BrandCheckDocumentRowInput {
  profileId: string
  /** Der Markenname — er landet in `host` (s. o.). */
  brandName: string
  locale: string
  userId: string
  rankingOptIn: boolean
  industry: string
  model: string
  promptVersion: string
  textHash: string
  ipHash: string
  computation: BrandCheckComputation
  criteria: readonly BrandCheckCriterionLike[]
  findings: readonly { criterionId: string, evidence: string }[]
}

/** Deckel der Spalten `brand_checks.host` bzw. `.model` (brand-016). */
const BRAND_CHECK_HOST_MAX = 256
const BRAND_CHECK_MODEL_MAX = 120

/**
 * DIE SPALTEN EINER `brand_checks`-ZEILE — vollständig und getypt.
 *
 * Sie steht als eigener Typ da, damit `createRow<BrandCheckRow>` sie
 * annimmt: ein `Record<string, unknown>` würde dort abgewiesen, und genau das
 * ist die Sicherung, die eine vergessene Spalte findet.
 */
export interface BrandCheckRowData {
  urlKey: string
  url: string
  host: string
  locale: string
  score: number
  band: string
  scoreVersion: string
  promptVersion: string
  model: string
  categories: string
  criteria: string
  findings: string
  textHash: string
  ipHash: string
  industry: string
  rankingOptIn: boolean
  hidden: boolean
  userId: string
  profileId: string
  source: string
}

export function brandCheckDocumentRow(input: BrandCheckDocumentRowInput): BrandCheckRowData {
  return {
    urlKey: brandCheckDocumentUrlKey(input.profileId),
    url: '',
    host: input.brandName.slice(0, BRAND_CHECK_HOST_MAX),
    locale: input.locale,
    score: input.computation.score,
    band: input.computation.band,
    scoreVersion: BRAND_CHECK_DOC_SCORE_VERSION,
    promptVersion: input.promptVersion,
    model: input.model.slice(0, BRAND_CHECK_MODEL_MAX),
    categories: JSON.stringify(input.computation.categories),
    criteria: JSON.stringify(input.criteria),
    findings: JSON.stringify(input.findings),
    textHash: input.textHash,
    ipHash: input.ipHash,
    industry: input.industry,
    rankingOptIn: input.rankingOptIn,
    hidden: false,
    userId: input.userId,
    profileId: input.profileId,
    source: 'document',
  }
}
