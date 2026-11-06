import type { BrandStepKey } from './slotRegistry'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  BRAND_CHECK_CRITERION_MAX,
  BRAND_CHECK_WIZARD_STEPS,
  type BrandCheckCategoryKey,
  type BrandCheckCriterion,
  type BrandCheckScoreValue,
  type BrandCheckScores,
  brandCheckCategoryScores,
  brandCheckCriterionById,
  computeBrandCheck,
} from './brandCheck'

/**
 * WAS DIE ERGEBNISSEITE AUS EINEM CHECK HERAUSLIEST (docs/plans/
 * BRAND-CHECK-SEITE.md §10, „drei Zoomstufen derselben Daten") — pur, ohne h3,
 * ohne Appwrite, ohne Vue.
 *
 * Der Check RECHNET in `brandCheck.ts`; hier wird nichts nachgerechnet, hier
 * wird BEFRAGT: Was hebt den Wert am meisten? Was funktioniert schon? Wie viele
 * Kriterien konnten wir überhaupt ansehen? Das sind Fragen der ANZEIGE, und sie
 * stehen deshalb neben der Rechnung und nicht in ihr.
 *
 * ── „+X PUNKTE" IST GEMESSEN, NICHT GESCHÄTZT ─────────────────────────────
 * `brandCheckScoreGain` rechnet den Gesamtwert ZWEIMAL mit derselben Funktion
 * (`computeBrandCheck`) — einmal wie er ist, einmal mit diesem einen Kriterium
 * auf 2 — und gibt die Differenz zurück. Eine zweite Formel („Gewicht durch
 * fünf mal Abstand") stünde daneben und wäre spätestens dann falsch, wenn eine
 * Kategorie `locked` ist: dort schrumpft der NENNER mit, und ein Punkt in einer
 * kleinen Kategorie wiegt plötzlich mehr als im Katalog steht. Ein Versprechen
 * über Punkte muss dieselbe Rechnung benutzen, die die Punkte vergibt.
 *
 * ── EIN SCHLOSS IST KEIN TO-DO ────────────────────────────────────────────
 * `null` heisst „von aussen nicht prüfbar" und nicht „null Punkte" (dieselbe
 * Regel wie im ganzen Check). Ein nicht bewertbares Kriterium bekommt deshalb
 * den Zugewinn 0 und steht in keinem Plan: „verbessert etwas, das wir gar
 * nicht ansehen konnten" ist kein nächster Schritt. Dass ein `null` den
 * Gesamtwert SEHR WOHL bewegte (es öffnet eine gesperrte Kategorie), ist wahr
 * und trotzdem kein Argument — die Zahl wäre eine Aufforderung an den Leser,
 * unsere Messgrenze zu reparieren.
 */

/** Ein Kriterium, so wie es in einem gespeicherten Ergebnis steht. */
export interface BrandCheckInsightCriterion {
  id: string
  score: BrandCheckScoreValue
  evidence: string
  note: string
}

/** Eine Kategorie, so wie sie in einem gespeicherten Ergebnis steht. */
export interface BrandCheckInsightCategory {
  key: string
  weight: number
  raw: number
  assessable: number
  locked: boolean
}

/**
 * DIE EINGABE ALLER VIER FUNKTIONEN — strukturell genau das, was
 * `BrandCheckResult` mitbringt (und was ein Test von Hand hinschreiben kann,
 * ohne die halbe Antwort zu erfinden).
 */
export interface BrandCheckInsightSource {
  score: number
  industry: string
  source: string
  createdAt: string
  categories: readonly BrandCheckInsightCategory[]
  criteria: readonly BrandCheckInsightCriterion[]
}

/** Kriterium-Id → Wert, so wie `computeBrandCheck` sie erwartet. */
function scoresOf(result: BrandCheckInsightSource): BrandCheckScores {
  const scores: BrandCheckScores = {}
  for (const entry of result.criteria) {
    // Unbekannte Ids (Bestandsdaten eines älteren Katalogs) dürfen mit: die
    // Rechnung liest nur den Katalog und ignoriert sie von selbst.
    scores[entry.id] = entry.score
  }
  return scores
}

/** Das Gewicht der Kategorie eines Kriteriums — 0 für Unbekanntes. */
function categoryWeightOf(category: BrandCheckCategoryKey | string): number {
  return BRAND_CHECK_CATEGORIES.find(entry => entry.key === category)?.weight ?? 0
}

/** Die Katalog-Position — der eine deterministische Tiebreak (s. u.). */
const CATALOG_ORDER = new Map(BRAND_CHECK_CRITERIA.map((criterion, index) => [criterion.id, index]))

function catalogIndex(criterionId: string): number {
  return CATALOG_ORDER.get(criterionId) ?? Number.MAX_SAFE_INTEGER
}

// ── Was ein einzelnes Kriterium wert ist ───────────────────────────────────

/**
 * WIE VIELE GANZE PUNKTE DER GESAMTWERT STIEGE, wenn genau dieses Kriterium
 * auf 2 stünde — alles andere unverändert.
 *
 * 0 kommt heraus für: ein unbekanntes Kriterium, ein nicht bewertbares
 * (`null`, s. Kopf), ein bereits perfektes — und für eines, dessen Zugewinn
 * unter einen halben Punkt fällt. Das letzte ist Absicht: „+0 Punkte" ist eine
 * ehrliche Auskunft über ein Kriterium in einer grossen Kategorie mit vielen
 * bewertbaren Geschwistern, und eine aufgerundete 1 wäre ein Versprechen, das
 * die nächste Messung nicht hält.
 */
export function brandCheckScoreGain(result: BrandCheckInsightSource, criterionKey: string): number {
  const criterion = brandCheckCriterionById(criterionKey)
  if (!criterion) return 0

  const scores = scoresOf(result)
  const current = scores[criterionKey]
  if (current !== 0 && current !== 1) return 0

  const before = computeBrandCheck(scores)
  const after = computeBrandCheck({ ...scores, [criterionKey]: BRAND_CHECK_CRITERION_MAX })
  return Math.max(0, after.score - before.score)
}

// ── Der Plan: was den Wert am meisten hebt ─────────────────────────────────

export interface BrandCheckImprovementEntry {
  /** Die Kriterium-Id (`a1` …) — der Schlüssel für Titel und Belege. */
  key: string
  category: BrandCheckCategoryKey
  /** 0 oder 1. Eine 2 ist kein Vorhaben, ein `null` erst recht nicht. */
  score: 0 | 1
  /** Ganze Punkte am Gesamtwert (`brandCheckScoreGain`). */
  gain: number
  evidence: string
  note: string
  /** Das Wizard-Kapitel oder `''` (s. `BRAND_CHECK_WIZARD_STEPS`). */
  wizardStep: BrandStepKey | ''
}

export interface BrandCheckImprovementPlan {
  entries: BrandCheckImprovementEntry[]
  /** Der Abstand zu 100 — die Obergrenze dessen, was der Plan zusammen hebt. */
  totalGain: number
}

/**
 * „DAS WÜRDE EUREN SCORE AM MEISTEN HEBEN" — alle Kriterien mit 0 oder 1, nach
 * Zugewinn absteigend.
 *
 * ── WARUM DIE SUMME NICHT EXAKT `totalGain` IST ───────────────────────────
 * `totalGain` ist `100 − score` und damit der ehrliche Deckel: mehr als bis zur
 * 100 kann niemand steigen. Die einzelnen Zugewinne sind GANZE Punkte, also
 * gerundet; ihre Summe weicht deshalb um bis zu einen halben Punkt JE EINTRAG
 * ab. Beides zusammen anzuzeigen ist trotzdem richtig — die Kopfzeile nennt den
 * Abstand zu 100, die Zeilen nennen ihren Anteil daran, und keine der beiden
 * Zahlen ist aus der anderen abgeleitet.
 *
 * ── DIE REIHENFOLGE IST DREISTUFIG UND DAMIT REPRODUZIERBAR ───────────────
 * Zugewinn absteigend ⇒ Kategorie-Gewicht absteigend ⇒ Katalog-Position. Ohne
 * die dritte Stufe stünde bei gleichem Zugewinn und gleichem Gewicht die
 * Reihenfolge der gespeicherten Liste da — und die ist die Reihenfolge, in der
 * das Modell geantwortet hat, also keine.
 */
export function brandCheckImprovementPlan(result: BrandCheckInsightSource): BrandCheckImprovementPlan {
  const entries = result.criteria
    .filter(entry => entry.score === 0 || entry.score === 1)
    .map(entry => ({ entry, criterion: brandCheckCriterionById(entry.id) }))
    .filter((pair): pair is { entry: BrandCheckInsightCriterion, criterion: BrandCheckCriterion } =>
      pair.criterion !== null)
    .map(({ entry, criterion }): BrandCheckImprovementEntry => ({
      key: entry.id,
      category: criterion.category,
      score: entry.score as 0 | 1,
      gain: brandCheckScoreGain(result, entry.id),
      evidence: entry.evidence ?? '',
      note: entry.note ?? '',
      wizardStep: BRAND_CHECK_WIZARD_STEPS[criterion.category],
    }))
    .sort((a, b) =>
      (b.gain - a.gain)
      || (categoryWeightOf(b.category) - categoryWeightOf(a.category))
      || (catalogIndex(a.key) - catalogIndex(b.key)))

  return { entries, totalGain: Math.max(0, 100 - result.score) }
}

// ── Die drei Befunde, neu geschnitten (§10) ────────────────────────────────

export interface BrandCheckStrength {
  key: string
  category: BrandCheckCategoryKey
  evidence: string
  note: string
}

export interface BrandCheckNextStep {
  key: string
  category: BrandCheckCategoryKey
  /** Das Kapitel — `''` heisst „der Wizard hat dafür keines" (s. Katalog). */
  wizardStep: BrandStepKey | ''
}

export interface BrandCheckHeadlineFindings {
  strength: BrandCheckStrength | null
  opportunity: BrandCheckImprovementEntry | null
  nextStep: BrandCheckNextStep | null
}

/**
 * STÄRKE · CHANCE · NÄCHSTER SCHRITT (§10) — die Kette „was funktioniert
 * schon → grösster Hebel → wo das im Wizard hingehört".
 *
 * ── DIE STÄRKE BRAUCHT EINEN BELEG ────────────────────────────────────────
 * Eine 2 ohne Zitat ist eine Behauptung, und der ganze Check ist gegen das
 * „gefühlt" gebaut. Gibt es keine belegte 2, ist `strength` `null` und die
 * Karte fällt weg — lieber eine Karte weniger als ein Lob ohne Grund.
 *
 * ── JEDES FELD DARF EINZELN FEHLEN ────────────────────────────────────────
 * Ein perfekter Auftritt hat keine Chance (und damit keinen nächsten Schritt),
 * ein sehr schwacher keine belegte Stärke. Drei unabhängige `| null` statt
 * eines „alles oder nichts": die Seite lässt weg, was leer ist.
 */
export function brandCheckHeadlineFindings(result: BrandCheckInsightSource): BrandCheckHeadlineFindings {
  const strength = result.criteria
    .filter(entry => entry.score === BRAND_CHECK_CRITERION_MAX && !!entry.evidence)
    .map(entry => ({ entry, criterion: brandCheckCriterionById(entry.id) }))
    .filter((pair): pair is { entry: BrandCheckInsightCriterion, criterion: BrandCheckCriterion } =>
      pair.criterion !== null)
    .sort((a, b) =>
      (categoryWeightOf(b.criterion.category) - categoryWeightOf(a.criterion.category))
      || (catalogIndex(a.entry.id) - catalogIndex(b.entry.id)))
    .map(({ entry, criterion }): BrandCheckStrength => ({
      key: entry.id,
      category: criterion.category,
      evidence: entry.evidence,
      note: entry.note ?? '',
    }))[0] ?? null

  const opportunity = brandCheckImprovementPlan(result).entries[0] ?? null

  return {
    strength,
    opportunity,
    nextStep: opportunity
      ? { key: opportunity.key, category: opportunity.category, wizardStep: opportunity.wizardStep }
      : null,
  }
}

// ── Die Fakten fürs Bento ──────────────────────────────────────────────────

export interface BrandCheckCategoryFact {
  key: string
  /** 0–100, normiert wie im Ranking (`brandCheckCategoryScores`). */
  score: number
}

export interface BrandCheckFacts {
  /** Die höchste bewertbare Kategorie — `null`, wenn keine bewertbar war. */
  strongest: BrandCheckCategoryFact | null
  weakest: BrandCheckCategoryFact | null
  /** Wie viele der Kriterien einen Wert tragen bzw. ein Schloss sind. */
  assessed: number
  notAssessable: number
  total: number
  /** Wie oft 2, 1 und 0 vergeben wurde. */
  full: number
  partial: number
  none: number
  industry: string
  source: string
  createdAt: string
}

/**
 * DIE ZAHLEN, DIE ÜBER DEM URTEIL STEHEN — „38 von 40 bewertet", „stärkste
 * Kategorie", „Branche", „Stand".
 *
 * ── STÄRKSTE UND SCHWÄCHSTE KATEGORIE SIND DIESELBE ZAHL WIE IM RANKING ───
 * Gerechnet über `brandCheckCategoryScores` (0–100, `locked` ⇒ `null`) und
 * nicht über `points`: `points` trägt das GEWICHT, dort hiesse eine 9 neben
 * einer 9 zweierlei. Gesperrte Kategorien kommen in beiden Auszeichnungen NICHT
 * vor — „am schwächsten ist, was wir nicht ansehen konnten" wäre die eine
 * Aussage, die der ganze `null`-Umgang verhindern soll.
 *
 * Bei Gleichstand gewinnt die Katalog-Reihenfolge (stärkste: die erste, und
 * schwächste ebenfalls die erste) — deterministisch und in beiden Richtungen
 * dieselbe Regel.
 */
export function brandCheckFacts(result: BrandCheckInsightSource): BrandCheckFacts {
  const ranked = brandCheckCategoryScores(result.categories)
    .filter((entry): entry is { id: string, score: number } => typeof entry.score === 'number')

  let strongest: BrandCheckCategoryFact | null = null
  let weakest: BrandCheckCategoryFact | null = null
  for (const entry of ranked) {
    if (!strongest || entry.score > strongest.score) strongest = { key: entry.id, score: entry.score }
    if (!weakest || entry.score < weakest.score) weakest = { key: entry.id, score: entry.score }
  }

  let assessed = 0
  let notAssessable = 0
  let full = 0
  let partial = 0
  let none = 0
  for (const entry of result.criteria) {
    if (entry.score === 0) { assessed += 1; none += 1 }
    else if (entry.score === 1) { assessed += 1; partial += 1 }
    else if (entry.score === BRAND_CHECK_CRITERION_MAX) { assessed += 1; full += 1 }
    else notAssessable += 1
  }

  return {
    strongest,
    weakest,
    assessed,
    notAssessable,
    total: result.criteria.length,
    full,
    partial,
    none,
    industry: result.industry,
    source: result.source,
    createdAt: result.createdAt,
  }
}
