import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  brandCheckCategoryScores,
  type BrandCheckCategoryLike,
} from './brandCheck'

/**
 * DER VERGLEICH ZWEIER CHECKS — „das Quartett"
 * (docs/archiv/BRAND-CHECK-SEITE.md §4, Paket P4). Pur: ohne h3, ohne Appwrite,
 * ohne Vue.
 *
 * ── ES WIRD NICHT NEU GERECHNET, NUR GEGENÜBERGESTELLT ────────────────────
 * Die acht Kategorie-Werte kommen aus `brandCheckCategoryScores()` — derselben
 * Umrechnung, aus der auch das Ranking und der Verlauf lesen. Zwei Zahlen
 * dürfen nur nebeneinander stehen, wenn sie dieselbe Normalisierung hinter
 * sich haben; `points` wäre die falsche Grundlage, weil dort das GEWICHT
 * mitreist (Eigenständigkeit geht bis 15, Handwerk bis 10) und eine 9 neben
 * einer 9 zweierlei hiesse.
 *
 * ── `null` GEWINNT NICHT UND VERLIERT NICHT ───────────────────────────────
 * „Nicht bewertbar" ist keine schwache Kategorie (dieselbe Regel wie im
 * ganzen Check). Fehlt der Wert auf EINER Seite, ist die Zeile `'na'` — die
 * andere Seite bekommt dafür KEINEN Punkt. Sonst gewänne ein Auftritt
 * Kategorien dadurch, dass beim Gegner etwas nicht messbar war, und das Fazit
 * („A gewinnt 5 von 8") wäre eine Aussage über unsere Messlücken statt über
 * zwei Marken.
 *
 * ── DIE REIHENFOLGE IST DER KATALOG, NICHT DIE ANTWORT ────────────────────
 * Iteriert wird über `BRAND_CHECK_CATEGORIES`, nicht über die Kategorien der
 * übergebenen Checks: beide Seiten sollen in derselben Ordnung untereinander
 * stehen, und eine Zeile aus der Zeit vor einer Katalog-Erweiterung fehlt dann
 * als `null`, statt die Zeilen gegeneinander zu verschieben.
 *
 * ── SYMMETRIE IST EINE ZUGESICHERTE EIGENSCHAFT ───────────────────────────
 * `compareBrandChecks(a, b)` und `compareBrandChecks(b, a)` sind exakte
 * Spiegelbilder (Test). Daran hängt der „Tauschen"-Knopf der Seite: er
 * vertauscht nur die Adresszeile und verlässt sich darauf, dass niemand
 * dadurch gewinnt.
 */

/** Wer diese Kategorie für sich entscheidet — `'na'` heisst „nicht bewertbar". */
export type BrandCheckCompareWinner = 'a' | 'b' | 'tie' | 'na'

export interface BrandCheckCompareRow {
  /** Der Kategorie-Schlüssel aus dem Katalog (`distinctiveness`, …). */
  id: string
  /** 0–100 oder `null` = nicht bewertbar. */
  a: number | null
  b: number | null
  winner: BrandCheckCompareWinner
}

/**
 * Die vier Zahlen des Fazits. `aWins + bWins + ties + notAssessable` ist immer
 * die Zahl der Kategorien im Katalog — das ist die Test-Invariante, an der man
 * merkt, wenn ein Fall irgendwo doppelt oder gar nicht gezählt wird.
 */
export interface BrandCheckCompareSummary {
  aWins: number
  bWins: number
  ties: number
  notAssessable: number
}

export interface BrandCheckCompareResult {
  rows: BrandCheckCompareRow[]
  summary: BrandCheckCompareSummary
}

/**
 * Was der Vergleich von einem Check braucht: seine Kategorien. Absichtlich
 * strukturell und nicht `BrandCheckResult` — so passt sowohl die Antwort der
 * Route als auch eine Testzeile hinein, ohne dass ein Test vierzig Kriterien
 * erfinden muss, die er nicht ansieht.
 */
export interface BrandCheckComparable {
  categories: readonly Partial<BrandCheckCategoryLike>[]
}

function scoreMap(check: BrandCheckComparable | null | undefined): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const entry of brandCheckCategoryScores(check?.categories ?? [])) {
    map.set(entry.id, entry.score)
  }
  return map
}

export function compareBrandChecks(
  a: BrandCheckComparable | null | undefined,
  b: BrandCheckComparable | null | undefined,
): BrandCheckCompareResult {
  const left = scoreMap(a)
  const right = scoreMap(b)

  const rows: BrandCheckCompareRow[] = BRAND_CHECK_CATEGORIES.map((category) => {
    const valueA = left.get(category.key) ?? null
    const valueB = right.get(category.key) ?? null
    return {
      id: category.key,
      a: valueA,
      b: valueB,
      winner: compareValues(valueA, valueB),
    }
  })

  const summary: BrandCheckCompareSummary = {
    aWins: rows.filter(row => row.winner === 'a').length,
    bWins: rows.filter(row => row.winner === 'b').length,
    ties: rows.filter(row => row.winner === 'tie').length,
    notAssessable: rows.filter(row => row.winner === 'na').length,
  }

  return { rows, summary }
}

function compareValues(a: number | null, b: number | null): BrandCheckCompareWinner {
  if (a === null || b === null) return 'na'
  if (a > b) return 'a'
  if (b > a) return 'b'
  return 'tie'
}

/**
 * WER VORNE LIEGT — gemessen an gewonnenen Kategorien, nicht am Gesamtwert.
 *
 * Der Gesamtwert steht schon im Kopf der Seite; das Fazit unter den acht Zeilen
 * beantwortet die ANDERE Frage („wer gewinnt öfter"). Beide können
 * auseinanderfallen — ein Auftritt mit einem Ausreisser nach oben kann den
 * höheren Score haben und trotzdem sechs von acht Kategorien verlieren. Genau
 * das soll die Seite zeigen dürfen, statt es glattzubügeln.
 */
export function brandCheckCompareLeader(summary: BrandCheckCompareSummary): 'a' | 'b' | 'tie' {
  if (summary.aWins > summary.bWins) return 'a'
  if (summary.bWins > summary.aWins) return 'b'
  return 'tie'
}

/**
 * ── DIE ERKENNTNISSE UNTER DEM DUELL ──────────────────────────────────────
 * (Davids Auftrag 2026-09-06: „unten beim Fazit die Infos ausbauen — in
 * welchen Kategorien gewinnt wer, liegen die beiden nah beieinander, wo liegt
 * einer extrem weit vorne und WORAN liegt das, wo ist Gleichstand … mehr
 * Insights, nach Wichtigkeit sortiert".)
 *
 * `compareBrandCheckInsights` beantwortet diese Fragen als GEORDNETE LISTE.
 * Die Reihenfolge IST die Wichtigkeit — sie steht hier und nicht im Template,
 * damit die Bento-Kacheln nichts sortieren müssen und eine spätere zweite
 * Darstellung (Mail-Report) dieselbe Rangfolge bekommt.
 *
 * ── ES WIRD WEITERHIN NICHTS NEU GERECHNET ────────────────────────────────
 * Kategorie-Werte kommen aus `compareBrandChecks` (also aus
 * `brandCheckCategoryScores`), der Gesamtwert aus der gespeicherten Zeile.
 * Neu ist nur, was daraus GESAGT wird.
 *
 * ── ZWEI VERSCHIEDENE „WER FÜHRT" ─────────────────────────────────────────
 * `brandCheckCompareLeader` zählt gewonnene KATEGORIEN, `overall.leader`
 * vergleicht den GESAMTWERT. Beide dürfen auseinanderfallen, und genau das
 * ist die interessante Aussage — deshalb bleiben es zwei Funktionen und nicht
 * eine mit einem Schalter.
 *
 * ── „WORAN LIEGT DAS" IST EIN BELEG, KEINE ERKLÄRUNG ──────────────────────
 * Zu einem grossen Kategorie-Abstand nennen wir die KRITERIEN, in denen sich
 * die Noten unterscheiden, mit BEIDEN Zitaten. Wir behaupten keine Ursache —
 * wir zeigen die Stelle, an der der Abstand entstanden ist. Ein `null` auf
 * einer Seite zählt dabei nicht als Unterschied (dieselbe Regel wie überall:
 * „nicht bewertbar" ist keine schlechte Note).
 */

/** Ab wann ein Kategorie-Abstand „extrem" ist und eine eigene Kachel bekommt. */
export const BRAND_CHECK_INSIGHT_GAP_THRESHOLD = 25

/** Höchstens so viele Kriterien-Unterschiede je Abstands-Kachel. */
export const BRAND_CHECK_INSIGHT_GAP_REASONS = 3

/** |Δ| ≤ 5 · 6–15 · > 15 — die drei Nähe-Stufen des Gesamtwerts. */
export type BrandCheckInsightCloseness = 'close' | 'clear' | 'wide'

export interface BrandCheckOverallInsight {
  kind: 'overall'
  /** Wer den höheren GESAMTWERT hat (nicht: die meisten Kategorien). */
  leader: 'a' | 'b' | 'tie'
  a: number
  b: number
  /** Der Betrag des Abstands — die Richtung steht in `leader`. */
  delta: number
  closeness: BrandCheckInsightCloseness
}

export interface BrandCheckWinsInsight {
  kind: 'wins'
  /** Kategorie-Schlüssel in Katalog-Reihenfolge. */
  a: string[]
  b: string[]
  tie: string[]
}

/** Ein Kriterium, in dem sich die Noten unterscheiden — mit beiden Belegen. */
export interface BrandCheckGapReason {
  criterionId: string
  a: number
  b: number
  /** Notendifferenz 1 oder 2 — die Sortierung der Gründe. */
  delta: number
  evidenceA: string
  evidenceB: string
}

export interface BrandCheckGapInsight {
  kind: 'gap'
  category: string
  a: number
  b: number
  delta: number
  leader: 'a' | 'b'
  reasons: BrandCheckGapReason[]
}

export interface BrandCheckTiesInsight {
  kind: 'ties'
  categories: { id: string, value: number }[]
}

/** Stärkste und schwächste Kategorie einer Seite — `null`, wenn nichts bewertbar war. */
export interface BrandCheckSideExtremes {
  best: { id: string, value: number } | null
  worst: { id: string, value: number } | null
}

export interface BrandCheckStrengthsInsight {
  kind: 'strengths'
  a: BrandCheckSideExtremes
  b: BrandCheckSideExtremes
}

export interface BrandCheckNotAssessableInsight {
  kind: 'notAssessable'
  categoriesA: number
  categoriesB: number
  criteriaA: number
  criteriaB: number
}

export type BrandCheckInsight
  = BrandCheckOverallInsight
    | BrandCheckWinsInsight
    | BrandCheckGapInsight
    | BrandCheckTiesInsight
    | BrandCheckStrengthsInsight
    | BrandCheckNotAssessableInsight

/**
 * Ein Kriterium so, wie es die Erkenntnisse brauchen — strukturell, damit ein
 * Test drei Zeilen bauen kann statt vierzig.
 */
export interface BrandCheckComparableCriterion {
  id: string
  category: string
  score: number | null
  evidence?: string
}

/**
 * Was die Erkenntnisse von einem Check brauchen: sein Gesamtwert, seine
 * Kategorien und (für das „woran liegt das") seine Kriterien.
 */
export interface BrandCheckInsightInput extends BrandCheckComparable {
  score?: number | null
  criteria?: readonly Partial<BrandCheckComparableCriterion>[]
}

/** Reihenfolge der Kriterien im Katalog — der Tiebreak gleich grosser Gründe. */
const CRITERION_ORDER = new Map(BRAND_CHECK_CRITERIA.map((entry, index) => [entry.id, index]))

function criterionMap(
  check: BrandCheckInsightInput | null | undefined,
): Map<string, { score: number | null, evidence: string }> {
  const map = new Map<string, { score: number | null, evidence: string }>()
  for (const entry of check?.criteria ?? []) {
    if (!entry || typeof entry.id !== 'string') continue
    map.set(entry.id, {
      score: typeof entry.score === 'number' ? entry.score : null,
      evidence: typeof entry.evidence === 'string' ? entry.evidence : '',
    })
  }
  return map
}

function closenessOf(delta: number): BrandCheckInsightCloseness {
  if (delta <= 5) return 'close'
  if (delta <= 15) return 'clear'
  return 'wide'
}

/**
 * Die Kriterien EINER Kategorie, in denen sich die Noten unterscheiden —
 * grösster Unterschied zuerst, bei Gleichstand die Katalog-Reihenfolge (sonst
 * hinge die Anzeige an der Reihenfolge der gespeicherten Zeile).
 */
function gapReasons(
  category: string,
  left: Map<string, { score: number | null, evidence: string }>,
  right: Map<string, { score: number | null, evidence: string }>,
): BrandCheckGapReason[] {
  const reasons: BrandCheckGapReason[] = []
  for (const criterion of BRAND_CHECK_CRITERIA) {
    if (criterion.category !== category) continue
    const a = left.get(criterion.id)
    const b = right.get(criterion.id)
    // Ein `null` ist kein Unterschied, sondern eine Messlücke.
    if (!a || !b || a.score === null || b.score === null || a.score === b.score) continue
    reasons.push({
      criterionId: criterion.id,
      a: a.score,
      b: b.score,
      delta: Math.abs(a.score - b.score),
      evidenceA: a.evidence,
      evidenceB: b.evidence,
    })
  }
  return reasons
    .sort((one, two) => (two.delta - one.delta)
      || ((CRITERION_ORDER.get(one.criterionId) ?? 0) - (CRITERION_ORDER.get(two.criterionId) ?? 0)))
    .slice(0, BRAND_CHECK_INSIGHT_GAP_REASONS)
}

/** Höchster und niedrigster BEWERTBARER Wert einer Seite (Katalog-Reihenfolge als Tiebreak). */
function extremesOf(rows: BrandCheckCompareRow[], side: 'a' | 'b'): BrandCheckSideExtremes {
  const scored = rows
    .map(row => ({ id: row.id, value: row[side] }))
    .filter((entry): entry is { id: string, value: number } => typeof entry.value === 'number')
  if (!scored.length) return { best: null, worst: null }
  let best = scored[0]!
  let worst = scored[0]!
  for (const entry of scored) {
    if (entry.value > best.value) best = entry
    if (entry.value < worst.value) worst = entry
  }
  return { best: { ...best }, worst: { ...worst } }
}

/** Wie viele Kriterien einer Seite gar keine Note haben — eine 0 IST eine Note. */
function unassessableCriteria(check: BrandCheckInsightInput | null | undefined): number {
  return (check?.criteria ?? []).filter(entry => !!entry && typeof entry.score !== 'number').length
}

/** Die Zeilen mit BEIDEN Werten — der Rest kann weder Abstand noch Gleichstand sein. */
interface ScoredRow { id: string, a: number, b: number, winner: BrandCheckCompareWinner }

function scoredRows(rows: BrandCheckCompareRow[]): ScoredRow[] {
  const out: ScoredRow[] = []
  for (const row of rows) {
    if (row.a === null || row.b === null) continue
    out.push({ id: row.id, a: row.a, b: row.b, winner: row.winner })
  }
  return out
}

export function compareBrandCheckInsights(
  a: BrandCheckInsightInput | null | undefined,
  b: BrandCheckInsightInput | null | undefined,
): BrandCheckInsight[] {
  // Ohne beide Seiten gibt es nichts zu erkennen — und eine halbe Erkenntnis
  // („X gewinnt 8 von 8") wäre eine Aussage über eine leere Spalte.
  if (!a || !b) return []

  const { rows } = compareBrandChecks(a, b)
  const insights: BrandCheckInsight[] = []

  // 1 · Das Gesamtbild
  const scoreA = typeof a.score === 'number' ? a.score : 0
  const scoreB = typeof b.score === 'number' ? b.score : 0
  const delta = Math.abs(scoreA - scoreB)
  insights.push({
    kind: 'overall',
    leader: scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : 'tie',
    a: scoreA,
    b: scoreB,
    delta,
    closeness: closenessOf(delta),
  })

  // 2 · Wer welche Kategorien gewinnt
  insights.push({
    kind: 'wins',
    a: rows.filter(row => row.winner === 'a').map(row => row.id),
    b: rows.filter(row => row.winner === 'b').map(row => row.id),
    tie: rows.filter(row => row.winner === 'tie').map(row => row.id),
  })

  // 3 · Die extremen Abstände, samt Beleg
  const left = criterionMap(a)
  const right = criterionMap(b)
  const both = scoredRows(rows)
  const gaps: BrandCheckGapInsight[] = both
    .filter(row => Math.abs(row.a - row.b) >= BRAND_CHECK_INSIGHT_GAP_THRESHOLD)
    .map(row => ({
      kind: 'gap' as const,
      category: row.id,
      a: row.a,
      b: row.b,
      delta: Math.abs(row.a - row.b),
      leader: row.a > row.b ? ('a' as const) : ('b' as const),
      reasons: gapReasons(row.id, left, right),
    }))
    .sort((one, two) => two.delta - one.delta)
  insights.push(...gaps)

  // 4 · Die Gleichstände
  const ties = both
    .filter(row => row.winner === 'tie')
    .map(row => ({ id: row.id, value: row.a }))
  if (ties.length) insights.push({ kind: 'ties', categories: ties })

  // 5 · Stärkste und schwächste Kategorie je Seite
  const extremesA = extremesOf(rows, 'a')
  const extremesB = extremesOf(rows, 'b')
  if (extremesA.best || extremesB.best) {
    insights.push({ kind: 'strengths', a: extremesA, b: extremesB })
  }

  // 6 · Was wir nicht ansehen konnten
  const categoriesA = rows.filter(row => row.a === null).length
  const categoriesB = rows.filter(row => row.b === null).length
  const criteriaA = unassessableCriteria(a)
  const criteriaB = unassessableCriteria(b)
  if (categoriesA + categoriesB + criteriaA + criteriaB > 0) {
    insights.push({ kind: 'notAssessable', categoriesA, categoriesB, criteriaA, criteriaB })
  }

  return insights
}
