import type { RunLeaseSnapshot, RunLeaseState } from '../../core/shared/runLease'
import { RUN_LEASE_DETAIL_MAX, parseRunLeaseDetail, runLeaseState } from '../../core/shared/runLease'
import type {
  MarketCompetitorStatus,
  MarketExclusionReason,
  MarketRunStep,
} from './marketProfile'
import type { MarketRunView } from './types/marketApi'

/**
 * DER LAUF AN SEINER ZEILE (GA1 P18, BE-008) — was ein Marktvergleich in
 * `market_runs.detail` hinterlässt, und wie die Übersicht es zurückliest.
 *
 * ── WARUM ES DIESES FELD GIBT ───────────────────────────────────────────
 * Seit P18 antwortet `POST /run` mit 202 und rechnet hinter der Antwort
 * weiter. Die Seite erfährt Fortschritt und Ausgang deshalb nicht mehr aus
 * der Antwort, sondern aus der LAUF-ZEILE, die sie über die Übersicht
 * abfragt. Das Detail ist die eine Stelle, an der der Lauf sagt, wie weit er
 * ist — und ob er schon Geld gekostet hat (`paid`, s. u.).
 *
 * ── NUR KENNUNGEN UND ZAHLEN ────────────────────────────────────────────
 * In `steps` stehen KEIN Name und KEINE Adresse: die Spalte fasst 4000
 * Zeichen, der GDPR-Export trägt aus ihr nur Zahlen hinaus, und ein Name
 * gehört der Kandidaten-Zeile. Die Übersicht setzt die Namen beim Lesen dazu
 * (`toMarketRunView`); ein gelöschter Kandidat fällt dabei heraus.
 *
 * ── `paid` UND `booked` — DIE ZWEI FRAGEN AN EINEN ABGEBROCHENEN LAUF ───
 * Stirbt ein Lauf (Deploy, Absturz), darf der nächste Start ihn übernehmen.
 * Ob er dafür einen der drei Tagesläufe kostet, hängt an zwei Tatsachen:
 *  - `booked`: der Lauf hat ein Kontingent belegt (selbst gebucht oder
 *    geerbt). Ohne das gibt es nichts zu erben.
 *  - `paid`: ein bezahlter Schritt hat BEGONNEN (Extraktion, Brand-Check,
 *    Bericht). Geschrieben wird es VOR dem Aufruf — stirbt der Prozess mitten
 *    darin, gilt der Lauf als bezahlt. Lieber verliert ein Mensch einmal
 *    einen Lauf, als dass ein Absturz zur Hintertür für Gratis-Läufe wird.
 * Übernommen (also nicht neu gebucht) wird nur, was gebucht und NICHT
 * bezahlt war (`marketRunInheritsBooking`).
 *
 * ── DER PARSER KLEMMT, ER LEHNT NICHT AB ─────────────────────────────────
 * Die Zeile kann aus einer älteren Fassung stammen oder (bei Überlänge) gar
 * kein Detail tragen. Jeder Wert wird einzeln geprüft und sonst auf einen
 * sicheren Vorgabewert gesetzt: Zahlen ≥ 0, unbekannte Phase ⇒ `fetch`,
 * `paid` nur bei einem echten `true`.
 */

/** Die Art des Laufs in `market_runs.scope`. */
export const MARKET_RUN_SCOPE = 'run'

export const MARKET_RUN_DETAIL_PHASES = ['fetch', 'checks', 'report', 'end'] as const
export type MarketRunDetailPhase = (typeof MARKET_RUN_DETAIL_PHASES)[number]

/** Ein Schritt im Detail — `MarketRunStep` OHNE Namen. */
export type MarketRunDetailStep = Omit<MarketRunStep, 'name' | 'brandCheckStarted'>

export interface MarketRunDetail {
  total: number
  done: number
  phase: MarketRunDetailPhase
  paid: boolean
  booked: boolean
  withReport: boolean
  aiEnabled: boolean
  extracted: number
  reused: number
  /** Wie viele überlange Adressen der Lauf verworfen hat (BE-011). */
  skippedUrls: number
  steps: MarketRunDetailStep[]
}

/** Kurze Ausgangs-Codes neben `done` (Spalte `outcome`, höchstens 32 Zeichen). */
export const MARKET_RUN_OUTCOMES = {
  done: 'done',
  failed: 'failed',
  /** Der Herzschlag ging verloren — ein anderer Prozess darf übernehmen. */
  leaseLost: 'lease_lost',
  /** Das `paid`-Vermerk liess sich nicht schreiben — ohne ihn kein bezahlter Schritt. */
  leaseUnwritable: 'lease_unwritable',
} as const

export function emptyMarketRunDetail(input: Partial<MarketRunDetail> = {}): MarketRunDetail {
  return {
    total: 0,
    done: 0,
    phase: 'fetch',
    paid: false,
    booked: false,
    withReport: false,
    aiEnabled: false,
    extracted: 0,
    reused: 0,
    skippedUrls: 0,
    steps: [],
    ...input,
  }
}

const STATUSES: readonly MarketCompetitorStatus[] = ['pending', 'reading', 'fetched', 'excluded', 'failed']
const REASONS: readonly MarketExclusionReason[] = ['robots', 'tdm', 'noText', 'unreachable', 'withdrawn']

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function parseStep(raw: unknown): MarketRunDetailStep | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const entry = raw as Record<string, unknown>
  const competitorId = typeof entry.competitorId === 'string' ? entry.competitorId.slice(0, 64) : ''
  if (!competitorId) return null
  const status = STATUSES.includes(entry.status as MarketCompetitorStatus)
    ? entry.status as MarketCompetitorStatus
    : 'failed'
  const step: MarketRunDetailStep = {
    competitorId,
    status,
    robotsChecked: entry.robotsChecked === true,
    pagesRead: count(entry.pagesRead),
  }
  const reason = REASONS.includes(entry.excludedReason as MarketExclusionReason)
    ? entry.excludedReason as MarketExclusionReason
    : undefined
  return {
    ...step,
    ...(reason ? { excludedReason: reason } : {}),
    ...(typeof entry.sitemapUrls === 'number' ? { sitemapUrls: count(entry.sitemapUrls) } : {}),
    ...(entry.llmsTxt === 'found' || entry.llmsTxt === 'missing' ? { llmsTxt: entry.llmsTxt } : {}),
    ...(typeof entry.jsonLd === 'boolean' ? { jsonLd: entry.jsonLd } : {}),
  }
}

/** Das Detail aus der Spalte — kaputt, fremd oder leer ⇒ sichere Vorgaben. */
export function parseMarketRunDetail(raw: string | null | undefined): MarketRunDetail {
  const value = parseRunLeaseDetail(raw)
  const phase = MARKET_RUN_DETAIL_PHASES.includes(value.phase as MarketRunDetailPhase)
    ? value.phase as MarketRunDetailPhase
    : 'fetch'
  const steps = Array.isArray(value.steps)
    ? value.steps.map(parseStep).filter((step): step is MarketRunDetailStep => step !== null)
    : []
  return {
    total: count(value.total),
    done: count(value.done),
    phase,
    paid: value.paid === true,
    booked: value.booked === true,
    withReport: value.withReport === true,
    aiEnabled: value.aiEnabled === true,
    extracted: count(value.extracted),
    reused: count(value.reused),
    skippedUrls: count(value.skippedUrls),
    steps,
  }
}

/** Ein Schritt ohne Namen und ohne alles, was nicht ins Detail gehört. */
export function toMarketRunDetailStep(step: MarketRunStep): MarketRunDetailStep {
  return {
    competitorId: step.competitorId,
    status: step.status,
    robotsChecked: step.robotsChecked,
    pagesRead: step.pagesRead,
    ...(step.excludedReason ? { excludedReason: step.excludedReason } : {}),
    ...(step.sitemapUrls !== undefined ? { sitemapUrls: step.sitemapUrls } : {}),
    ...(step.llmsTxt ? { llmsTxt: step.llmsTxt } : {}),
    ...(step.jsonLd !== undefined ? { jsonLd: step.jsonLd } : {}),
  }
}

/**
 * DAS DETAIL, DAS IN DIE SPALTE PASST.
 *
 * `clampRunLeaseDetail` schreibt bei Überlänge `''` — dann wären auch
 * Fortschritt und `paid` weg, und ausgerechnet `paid` entscheidet über das
 * Kontingent. Deshalb fallen hier zuerst die `steps` weg: sie sind die
 * einzige Liste, die wachsen kann, und das Protokoll je Kandidat steht
 * ohnehin an der Kandidaten-Zeile.
 */
export function fitMarketRunDetail(detail: MarketRunDetail): MarketRunDetail {
  return JSON.stringify(detail).length <= RUN_LEASE_DETAIL_MAX ? detail : { ...detail, steps: [] }
}

/**
 * ERBT DIESER START DIE BUCHUNG SEINES VORGÄNGERS? Nur wenn der Vorgänger
 * abgebrochen ist (`stalled`), ein Kontingent belegt hatte und noch nichts
 * Bezahltes begonnen hatte (Kopf).
 */
export function marketRunInheritsBooking(
  previousState: RunLeaseState,
  previousDetail: string | null | undefined,
): boolean {
  if (previousState !== 'stalled') return false
  const detail = parseMarketRunDetail(previousDetail)
  return detail.booked && !detail.paid
}

export function noMarketRunView(): MarketRunView {
  return {
    state: 'none',
    startedAt: '',
    finishedAt: '',
    total: 0,
    done: 0,
    phase: 'fetch',
    aiEnabled: false,
    failed: false,
    steps: [],
  }
}

/**
 * DIE ÜBERSICHT EINES LAUFS — gegen die SERVER-Uhr gerechnet.
 *
 * Die Namen kommen aus den Kandidaten-Zeilen; ein Schritt, dessen Kandidat
 * es nicht mehr gibt, wird weggelassen (eine Zeile ohne Namen wäre ein
 * Rätsel, und „da war mal was" erzählt die Kandidatenliste selbst).
 */
export function toMarketRunView(
  lease: (Pick<RunLeaseSnapshot, 'startedAt' | 'heartbeatAt' | 'finishedAt' | 'outcome' | 'detail'>) | null,
  nowMs: number,
  names: ReadonlyMap<string, string>,
): MarketRunView {
  if (!lease) return noMarketRunView()
  const state = runLeaseState(lease, nowMs)
  const detail = parseMarketRunDetail(lease.detail)
  const steps: MarketRunStep[] = []
  for (const step of detail.steps) {
    const name = names.get(step.competitorId)
    if (name === undefined) continue
    steps.push({ ...step, name })
  }
  return {
    state,
    startedAt: lease.startedAt,
    finishedAt: lease.finishedAt,
    total: detail.total,
    done: Math.min(detail.done, detail.total || detail.done),
    phase: detail.phase,
    aiEnabled: detail.aiEnabled,
    failed: Boolean(lease.finishedAt) && lease.outcome !== 'done',
    steps,
  }
}
