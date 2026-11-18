import type { H3Event } from 'h3'
import { runLeaseState } from '../../../core/shared/runLease'
import type { MarketReportRunDetail } from '../../shared/marketReportRun'
import {
  MARKET_REPORT_RUN_OUTCOMES,
  MARKET_REPORT_RUN_SCOPE,
  noMarketReportRunView,
  toMarketReportRunView,
} from '../../shared/marketReportRun'
import type { MarketReportRunView } from '../../shared/types/marketApi'
import { loadOwnedProfile, readBrandAiEnabled } from '../contracts/brandContract'
import { isMarketRowMissing } from './marketStore'
import { marketRunStore } from './marketRun'
import {
  computeMarketReport,
  latestMarketReport,
  loadMarketReportState,
  logMarketReport,
  marketReportForRevision,
  persistMarketReport,
} from './marketReportService'

/**
 * DER BERICHT HINTER DER ANTWORT (LL1 d, 2026-11-18) — die Arbeit, die bis
 * LL1 d in `POST /report` selbst stand.
 *
 * ── ER WIRFT NIE ─────────────────────────────────────────────────────────
 * Jeder Ausgang landet an der Lauf-Zeile: `done`, oder ein kurzes Wort
 * (`shared/marketReportRun.ts`). Schreibt auch das Ende nicht mehr, bleibt
 * der Herzschlag stehen und die Zeile wird nach der Stall-Frist `stalled`.
 *
 * ── ER SCHREIBT GEGEN DEN STAND VON JETZT ─────────────────────────────────
 * Zwischen Start und Ende liegen bis zu 90 s Modell-Aufruf. Was er am Ende
 * schreibt, liest er deshalb UNMITTELBAR DAVOR neu:
 *  - den Bericht-Stand selbst lädt er erst hier (nicht den der Anfrage);
 *  - VOR dem Schreiben: gibt es das Branding noch (und gehört es noch dem
 *    Konto)? Liegt zu diesem Stand inzwischen schon ein Bericht? Ist seit
 *    dem Start ein NEUERER Bericht entstanden? In jedem dieser Fälle schreibt
 *    er nichts — sonst räumte `writeMarketFindings` die offenen Befunde eines
 *    jüngeren Berichts weg oder legte Befunde an ein gelöschtes Branding.
 *  - Ging der Herzschlag verloren, schreibt er gar nichts mehr (ein anderer
 *    Start darf übernommen haben).
 *
 * ── `event` NUR LESEND ───────────────────────────────────────────────────
 * Runtime-Config, Admin-Client, Konto im Kontext — kein `setHeader`, kein
 * `createError` als Ergebnis: die Antwort ist längst gesendet.
 */

type MarketRunStore = ReturnType<typeof marketRunStore>
type MarketRunLease = Awaited<ReturnType<typeof acquireRunLease>>['lease']

/**
 * DEN BERICHT-LAUF LESEN — fail-soft: eine nicht lesbare Lauf-Tabelle heisst
 * „kein Lauf", der Bericht selbst bleibt sichtbar.
 */
export async function readMarketReportRunView(event: H3Event, profileId: string): Promise<MarketReportRunView> {
  try {
    const latest = await marketRunStore(event).latest(MARKET_REPORT_RUN_SCOPE, profileId)
    return toMarketReportRunView(latest, Date.now())
  }
  catch (error) {
    if (!isMarketRowMissing(error)) {
      logEvent('warn', 'market.report_run_unreadable', {
        message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      })
    }
    return noMarketReportRunView()
  }
}

/**
 * DER GEGENSEITIGE AUSSCHLUSS (Kopf von `report.post.ts`): läuft auf DEMSELBEN
 * Branding gerade ein Lauf der anderen Art, wird der eigene, eben genommene
 * Start zurückgenommen und 409 mit `code` gemeldet.
 *
 * Er prüft NACH dem Nehmen der eigenen Sperre. Zwei Starts verschiedener Art
 * haben verschiedene Zeilen-Ids und halten sich über die Sperre nicht auf;
 * weil aber jeder ERST seine Zeile anlegt und DANN nach der anderen sieht,
 * sieht der Spätere den Früheren immer — schlimmstenfalls geben beide auf,
 * nie laufen beide.
 *
 * Nicht lesbar ⇒ 503 wie die Sperre selbst (`run_lease_unavailable`): ohne
 * den Blick auf den anderen Lauf ist der Ausschluss nicht prüfbar.
 */
export async function refuseWhileMarketRunActive(
  store: MarketRunStore,
  own: MarketRunLease,
  other: { scope: string, subject: string, code: string },
): Promise<void> {
  let state: ReturnType<typeof runLeaseState>
  try {
    state = runLeaseState(await store.latest(other.scope, other.subject), Date.now())
  }
  catch {
    await dropRunLease(store, own)
    throw createError({ status: 503, statusText: 'Run lease unavailable', data: { code: 'run_lease_unavailable' } })
  }
  if (state !== 'running') return
  await dropRunLease(store, own)
  throw createError({ status: 409, statusText: 'Another market run is in flight', data: { code: other.code } })
}

export interface MarketReportRunInput {
  store: MarketRunStore
  lease: MarketRunLease
  userId: string
  profileId: string
  contentLocale: string
  /** Hat dieser Lauf ein Kontingent belegt (gebucht oder geerbt)? */
  booked: boolean
}

/** Der `paid`-Vermerk liess sich nicht schreiben — ohne ihn kein Modell-Aufruf. */
class MarketReportLeaseUnwritable extends Error {}

/** Den Bericht rechnen und — wenn es noch stimmt — schreiben. Wirft nie (Kopf). */
export async function runMarketReport(event: H3Event, input: MarketReportRunInput): Promise<void> {
  const startedAtMs = Date.now()
  const alive = keepRunLeaseAlive(input.store, input.lease)
  const detail: MarketReportRunDetail = { booked: input.booked, paid: false, withProfile: 0 }
  let outcome: string = MARKET_REPORT_RUN_OUTCOMES.done

  const progress = async (): Promise<void> => {
    try {
      await touchRunLease(input.store, input.lease, { detail })
    }
    catch {
      // Ein verpasster Zwischenstand ist kein Abbruch; das Ende schreibt alles.
    }
  }

  try {
    // `booked` zuerst an die Zeile: erst damit kann ein Nachfolger nach einem
    // Absturz die Buchung erben (`marketReportRunInheritsBooking`).
    await progress()

    const state = await loadMarketReportState(event, input.profileId)
    detail.withProfile = state.withProfile

    if (state.withProfile === 0) {
      outcome = MARKET_REPORT_RUN_OUTCOMES.noProfiles
    }
    else if (await marketReportForRevision(event, input.profileId, state.revisionKey)) {
      // Zu GENAU diesem Stand liegt schon ein Bericht — nichts zu rechnen.
      outcome = MARKET_REPORT_RUN_OUTCOMES.done
    }
    else if (!(await readBrandAiEnabled(event))) {
      outcome = MARKET_REPORT_RUN_OUTCOMES.aiDisabled
    }
    else if (alive.lost()) {
      outcome = MARKET_REPORT_RUN_OUTCOMES.leaseLost
    }
    else {
      // AB HIER KOSTET ES — der Vermerk steht VOR dem Aufruf; ohne ihn kein
      // Aufruf (ein Lauf ohne Vermerk, der danach stirbt, gälte als unbezahlt).
      detail.paid = true
      try {
        await touchRunLease(input.store, input.lease, { detail })
      }
      catch {
        throw new MarketReportLeaseUnwritable()
      }

      const report = await computeMarketReport(event, state, input.contentLocale)
      if (report.failure) {
        outcome = report.failure
        logMarketReport(state, report, 0, startedAtMs)
      }
      else {
        const refusal = await writeRefusal(event, input, state.revisionKey, () => alive.lost())
        if (refusal) {
          outcome = refusal
        }
        else {
          const findingIds = await persistMarketReport(event, input.profileId, state, report)
          logMarketReport(state, report, findingIds.length, startedAtMs)
        }
      }
    }
  }
  catch (error) {
    outcome = error instanceof MarketReportLeaseUnwritable
      ? MARKET_REPORT_RUN_OUTCOMES.leaseUnwritable
      : MARKET_REPORT_RUN_OUTCOMES.failed
    // Nur die Art, nie Inhalt: eine Appwrite- oder Anbieter-Meldung kann
    // fremden Text tragen.
    logEvent('warn', 'market.report_run_failed', {
      code: outcome,
      status: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 0,
    })
  }
  finally {
    alive.stop()
  }

  try {
    await finishRunLease(input.store, input.lease, { outcome, detail })
  }
  catch (error) {
    // Dann bleibt der Herzschlag stehen, und die Zeile wird `stalled` (Kopf).
    logEvent('warn', 'market.report_run_finish_unwritten', {
      code: outcome,
      message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    })
  }
  logEvent('info', 'market.report_run_finished', {
    code: outcome,
    ms: Date.now() - startedAtMs,
    paid: detail.paid,
    withProfile: detail.withProfile,
  })
}

/**
 * DARF ER NOCH SCHREIBEN? — unmittelbar vor dem Schreiben gelesen (Kopf).
 * `null` ⇒ ja; sonst der Ausgang, mit dem er OHNE zu schreiben endet.
 */
async function writeRefusal(
  event: H3Event,
  input: MarketReportRunInput,
  revisionKey: string,
  lost: () => boolean,
): Promise<string | null> {
  try {
    await loadOwnedProfile(event, input.userId, input.profileId)
  }
  catch (error) {
    const status = (error as { statusCode?: unknown, status?: unknown } | null)
    const code = status?.statusCode ?? status?.status
    if (code === 404 || code === 403) return MARKET_REPORT_RUN_OUTCOMES.profileGone
    throw error
  }

  // Derselbe Stand ist inzwischen berichtet (ein anderer Weg war schneller) —
  // ein zweiter Bericht unter demselben Schlüssel wäre eine Kopie.
  if (await marketReportForRevision(event, input.profileId, revisionKey)) {
    return MARKET_REPORT_RUN_OUTCOMES.done
  }
  // Ein JÜNGERER Bericht ist seit dem Start entstanden: der eigene beschriebe
  // einen älteren Stand, und seine Befunde räumten die offenen des neueren
  // weg. Er tritt zurück; die Seite zeigt den jüngeren.
  const latest = await latestMarketReport(event, input.profileId)
  if (latest && Date.parse(latest.$createdAt) > Date.parse(input.lease.startedAt)) {
    return MARKET_REPORT_RUN_OUTCOMES.done
  }

  // ZULETZT der Herzschlag: zwischen dem Modell-Aufruf und hier liegen
  // weitere Abfragen, und genau so spät wie möglich gefragt ist die Antwort
  // am nächsten an dem Augenblick, in dem geschrieben wird.
  return lost() ? MARKET_REPORT_RUN_OUTCOMES.leaseLost : null
}
