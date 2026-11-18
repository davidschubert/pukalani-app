import { AI_ENDPOINT_UNAVAILABLE_CODE } from '../../core/shared/aiProviderRouting'
import type { RunLeaseSnapshot, RunLeaseState } from '../../core/shared/runLease'
import { parseRunLeaseDetail, runLeaseState } from '../../core/shared/runLease'
import { MARKET_AI_DISABLED_CODE, MARKET_NO_PROFILES_CODE } from './marketLimits'
import type { MarketReportRunView } from './types/marketApi'

/**
 * DER BERICHT-LAUF AN SEINER ZEILE (LL1 d, 2026-11-18) — was `POST /report`
 * in `market_runs` hinterlässt, und wie `GET /report` es zurückliest.
 *
 * ── WARUM ES DIESE ART GIBT ─────────────────────────────────────────────
 * Der Bericht ist ein bezahlter Text-Lauf mit 90 s Frist
 * (`MARKET_REPORT_TIMEOUT_MS`), der Webserver wartet 60 s. Bis LL1 d rechnete
 * die Route in der Anfrage: der Mensch sah einen Fehler, obwohl der Lauf
 * gelang, und ein zweiter Klick bezahlte doppelt. Jetzt nimmt sie eine
 * Lauf-Sperre in DERSELBEN Tabelle wie der Vergleichs-Lauf (`market_runs`),
 * nur mit einer eigenen Art (`scope: 'report'`, Gegenstand = das Branding).
 * `scope` ist eine freie Textspalte des Core-Schemas — keine Migration.
 *
 * ── NUR KENNUNGEN UND ZAHLEN IM DETAIL ──────────────────────────────────
 * `booked` und `paid` (dieselben zwei Fragen an einen abgebrochenen Lauf wie
 * beim Vergleichs-Lauf, Kopf von `marketRun.ts`) und `withProfile` (wie viele
 * Marktprofile in den Bericht gingen). Kein Name, kein Text.
 *
 * ── DIE AUSGÄNGE ────────────────────────────────────────────────────────
 * `done` oder ein kurzes Wort (höchstens 32 Zeichen) — dieselben Wörter, die
 * bis LL1 d `data.code` der Anfrage waren (`ai_disabled`,
 * `market_no_profiles`, `ai_endpoint_unavailable`), dazu die Ausfälle des
 * Modells (`provider_error`, `schema_error`), der Abbruch des Herzschlags
 * und „das Branding gibt es nicht mehr".
 */

/** Die Art des Bericht-Laufs in `market_runs.scope`. */
export const MARKET_REPORT_RUN_SCOPE = 'report'

/**
 * Der Grund an der 409, wenn ein Bericht starten soll, während der
 * Vergleichs-Lauf DESSELBEN Brandings noch rechnet (Kopf von `report.post.ts`).
 */
export const MARKET_COMPARISON_RUNNING_CODE = 'comparison_running'

/** Der Grund an der 409, wenn der Vergleichs-Lauf starten soll, während ein Bericht rechnet. */
export const MARKET_REPORT_RUNNING_CODE = 'report_running'

/**
 * Die Frist JE ABFRAGE der Seite (wie `BRAND_RUN_POLL_TIMEOUT_MS` im
 * brand-Layer): `useRunPolling` überlappt nicht, eine hängende Abfrage hielte
 * das Nachfragen sonst an.
 */
export const MARKET_REPORT_POLL_TIMEOUT_MS = 10_000

export const MARKET_REPORT_RUN_OUTCOMES = {
  done: 'done',
  failed: 'failed',
  /** Der Herzschlag ging verloren — der Lauf schreibt nichts mehr. */
  leaseLost: 'lease_lost',
  /** Der `paid`-Vermerk liess sich nicht schreiben — ohne ihn kein Modell-Aufruf. */
  leaseUnwritable: 'lease_unwritable',
  aiDisabled: MARKET_AI_DISABLED_CODE,
  noProfiles: MARKET_NO_PROFILES_CODE,
  aiEndpointUnavailable: AI_ENDPOINT_UNAVAILABLE_CODE,
  providerError: 'provider_error',
  schemaError: 'schema_error',
  /** Das Branding gibt es nicht mehr (gelöscht während des Laufs). */
  profileGone: 'profile_gone',
} as const

export interface MarketReportRunDetail {
  /** Hat dieser Lauf ein Kontingent belegt (gebucht oder geerbt)? */
  booked: boolean
  /** Hat der bezahlte Schritt (der Modell-Aufruf) BEGONNEN? */
  paid: boolean
  /** Wie viele Marktprofile des Feldes in den Bericht gingen. */
  withProfile: number
}

export function emptyMarketReportRunDetail(input: Partial<MarketReportRunDetail> = {}): MarketReportRunDetail {
  return { booked: false, paid: false, withProfile: 0, ...input }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/** Das Detail aus der Spalte — kaputt, fremd oder leer ⇒ sichere Vorgaben. */
export function parseMarketReportRunDetail(raw: string | null | undefined): MarketReportRunDetail {
  const value = parseRunLeaseDetail(raw)
  return {
    booked: value.booked === true,
    paid: value.paid === true,
    withProfile: count(value.withProfile),
  }
}

/**
 * ERBT DIESER START DIE BUCHUNG SEINES VORGÄNGERS? Nur wenn der Vorgänger
 * abgebrochen ist (`stalled`), ein Kontingent belegt hatte und den Modell-
 * Aufruf noch nicht begonnen hatte — dieselbe Regel wie beim Vergleichs-Lauf.
 */
export function marketReportRunInheritsBooking(
  previousState: RunLeaseState,
  previousDetail: string | null | undefined,
): boolean {
  if (previousState !== 'stalled') return false
  const detail = parseMarketReportRunDetail(previousDetail)
  return detail.booked && !detail.paid
}

export function noMarketReportRunView(): MarketReportRunView {
  return { state: 'none', startedAt: '', finishedAt: '', failed: false }
}

/** Der Bericht-Lauf, wie die Seite ihn sieht — gegen die SERVER-Uhr gerechnet. */
export function toMarketReportRunView(
  lease: Pick<RunLeaseSnapshot, 'startedAt' | 'heartbeatAt' | 'finishedAt' | 'outcome'> | null,
  nowMs: number,
): MarketReportRunView {
  if (!lease) return noMarketReportRunView()
  const state = runLeaseState(lease, nowMs)
  const failed = Boolean(lease.finishedAt) && lease.outcome !== MARKET_REPORT_RUN_OUTCOMES.done
  return {
    state,
    startedAt: lease.startedAt,
    finishedAt: lease.finishedAt,
    failed,
    ...(failed && lease.outcome ? { failure: lease.outcome } : {}),
  }
}
