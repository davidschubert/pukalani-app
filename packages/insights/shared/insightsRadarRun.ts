import type { RunLeaseSnapshot } from '../../core/shared/runLease'
import { parseRunLeaseDetail, runLeaseState } from '../../core/shared/runLease'
import type { InsightsRadarRunResult, InsightsRadarRunView } from './types/insightsApi'

/**
 * DER RADAR-LAUF AN SEINER ZEILE (LL1 a, 2026-11-17) — was „Jetzt laufen
 * lassen" in `insights_runs` hinterlässt und wie die Radar-Seite es liest.
 *
 * ── WARUM ES DIESE DATEI GIBT ───────────────────────────────────────────
 * Bis LL1 a rechnete der Knopf den Lauf IN der Anfrage, mit einer Abruf-Frist
 * von 30 s, damit die Antwort vor den 60 s des Webservers ankam — bei einer
 * langsamen API war das Ergebnis dann ein Teil. Seit LL1 a nimmt die Route die
 * Lauf-Sperre, antwortet 202 und rechnet dahinter (Muster des Marktvergleichs,
 * `core/shared/runLease.ts`). Das Ergebnis kommt deshalb nicht mehr aus der
 * Antwort, sondern aus der LAUF-ZEILE, die `GET /api/insights/radar` mitliest.
 *
 * ── EIN GEGENSTAND ──────────────────────────────────────────────────────
 * Es gibt genau EINEN Radar je Instanz — der Gegenstand der Sperre ist also
 * fest. Zwei Betreiber, die gleichzeitig drücken, treffen dieselbe Zeile, und
 * genau einer startet.
 *
 * ── NUR ZAHLEN ──────────────────────────────────────────────────────────
 * Im `detail` stehen nur die Zahlen des Laufs und der Grund `skipped` — kein
 * Kanalname, keine Video-Id. Die Spalte fasst 4.000 Zeichen; das Ergebnis
 * braucht keine 300.
 *
 * ── DER PARSER KLEMMT, ER LEHNT NICHT AB ─────────────────────────────────
 * Die Zeile kann aus einer älteren Fassung stammen oder leer sein. Jeder Wert
 * wird einzeln geprüft: Zahlen ≥ 0, unbekannter Grund ⇒ weggelassen,
 * `partial` nur bei einem echten `true`.
 */

/** Die Art des Laufs in `insights_runs.scope`. */
export const INSIGHTS_RADAR_RUN_SCOPE = 'radar'

/** Der Gegenstand — fest, weil es nur EINEN Radar je Instanz gibt. */
export const INSIGHTS_RADAR_RUN_SUBJECT = 'instance'

/** Kurze Ausgangs-Codes (Spalte `outcome`, höchstens 32 Zeichen). */
export const INSIGHTS_RADAR_RUN_OUTCOMES = {
  done: 'done',
  failed: 'failed',
} as const

const SKIPPED_REASONS: readonly NonNullable<InsightsRadarRunResult['skipped']>[] = [
  'not_configured', 'no_channels', 'quota_estimate', 'running',
]

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/**
 * Das Sweep-Ergebnis als Detail — NUR die Felder, die hierher gehören. Der
 * Typ des Arguments ist bewusst strukturell: so hängt `shared/` nicht am
 * Server-Modul des Sweeps.
 */
export function toInsightsRadarRunDetail(result: InsightsRadarRunResult): InsightsRadarRunResult {
  return {
    channels: count(result.channels),
    videos: count(result.videos),
    upserted: count(result.upserted),
    deleted: count(result.deleted),
    tooOld: count(result.tooOld),
    errors: count(result.errors),
    quotaUnits: count(result.quotaUnits),
    ...(result.skipped ? { skipped: result.skipped } : {}),
    ...(result.partial ? { partial: true, channelsUnread: count(result.channelsUnread) } : {}),
    ...(result.watchlist
      ? {
          watchlist: {
            items: count(result.watchlist.items),
            updated: count(result.watchlist.updated),
            gone: count(result.watchlist.gone),
          },
        }
      : {}),
  }
}

/** Das Detail aus der Spalte — kaputt, fremd oder leer ⇒ Nullen. */
export function parseInsightsRadarRunDetail(raw: string | null | undefined): InsightsRadarRunResult {
  const value = parseRunLeaseDetail(raw)
  const skipped = SKIPPED_REASONS.includes(value.skipped as NonNullable<InsightsRadarRunResult['skipped']>)
    ? value.skipped as NonNullable<InsightsRadarRunResult['skipped']>
    : undefined
  const watchlist = typeof value.watchlist === 'object' && value.watchlist !== null && !Array.isArray(value.watchlist)
    ? value.watchlist as Record<string, unknown>
    : null
  return toInsightsRadarRunDetail({
    channels: count(value.channels),
    videos: count(value.videos),
    upserted: count(value.upserted),
    deleted: count(value.deleted),
    tooOld: count(value.tooOld),
    errors: count(value.errors),
    quotaUnits: count(value.quotaUnits),
    ...(skipped ? { skipped } : {}),
    ...(value.partial === true ? { partial: true, channelsUnread: count(value.channelsUnread) } : {}),
    ...(watchlist
      ? { watchlist: { items: count(watchlist.items), updated: count(watchlist.updated), gone: count(watchlist.gone) } }
      : {}),
  })
}

/**
 * DER LAUF, WIE DIE SEITE IHN SIEHT — gegen die SERVER-Uhr gerechnet.
 *
 * `result` gibt es nur bei `done`: ein laufender Lauf hat noch keine Zahlen,
 * ein gescheiterter oder abgebrochener hat keine, denen man glauben dürfte.
 * Keine Zeile ⇒ `null` (es lief noch nie ein Knopf-Lauf).
 */
export function toInsightsRadarRunView(
  lease: Pick<RunLeaseSnapshot, 'startedAt' | 'heartbeatAt' | 'finishedAt' | 'outcome' | 'detail'> | null,
  nowMs: number,
): InsightsRadarRunView | null {
  if (!lease) return null
  const state = runLeaseState(lease, nowMs)
  return {
    state,
    startedAt: lease.startedAt,
    finishedAt: lease.finishedAt,
    result: state === 'done' ? parseInsightsRadarRunDetail(lease.detail) : null,
  }
}
