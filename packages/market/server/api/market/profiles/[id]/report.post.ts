import type { MarketReportResponse } from '../../../../../shared/types/marketApi'
import { MARKET_AI_DISABLED_CODE, MARKET_NO_PROFILES_CODE } from '../../../../../shared/marketLimits'
import { MARKET_RUN_SCOPE } from '../../../../../shared/marketRun'
import {
  MARKET_COMPARISON_RUNNING_CODE,
  MARKET_REPORT_RUN_SCOPE,
  emptyMarketReportRunDetail,
  marketReportRunInheritsBooking,
  toMarketReportRunView,
} from '../../../../../shared/marketReportRun'
import { readBrandAiEnabled } from '../../../../contracts/brandContract'
import { requireMarketProfile, requireMarketUnlocked } from '../../../../utils/marketAccess'
import { bookMarketReport } from '../../../../utils/marketQuota'
import { marketRunStore } from '../../../../utils/marketRun'
import {
  loadMarketFindings,
  loadMarketReportState,
  marketReportForRevision,
  toMarketReportView,
} from '../../../../utils/marketReportService'
import {
  readMarketReportRunView,
  refuseWhileMarketRunActive,
  runMarketReport,
} from '../../../../utils/marketReportRun'

/**
 * DER VERGLEICH (Plan §2.3 Nr. 4, MV1 M3) — seit LL1 d (2026-11-18) eine
 * dünne Route: sie prüft, sperrt, bucht und antwortet 202. Gerechnet wird
 * dahinter (`server/utils/marketReportRun.ts`).
 *
 * ── ER RUFT NICHT AB ──────────────────────────────────────────────────────
 * Diese Route rechnet über den Stand, der DA IST. Das Holen ist der Lauf
 * (`run.post.ts`, M2), und die Trennung ist Absicht: nach einer Korrektur an
 * einem eigenen Feld will der Kunde einen neuen Vergleich, aber ganz sicher
 * nicht fünf fremde Websites ein zweites Mal belästigen.
 *
 * ── WARUM HINTER DER ANTWORT ──────────────────────────────────────────────
 * Der Bericht ist ein bezahlter Text-Lauf mit 90 s Frist
 * (`MARKET_REPORT_TIMEOUT_MS`), der Webserver wartet 60 s. Bis LL1 d rechnete
 * die Route in der Anfrage: der Mensch sah einen Fehler, obwohl der Lauf
 * gelang, und ein zweiter Klick bezahlte doppelt (Regel „LANGE ARBEIT GEHÖRT
 * NICHT IN DIE ANFRAGE"). Vorbild ist der Vergleichs-Lauf desselben Layers.
 *
 * ── DIE STUFEN, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  1. Zugang, Freischaltung (Kapitel B) — dieselbe Schranke wie beim Lauf.
 *  2. Stand laden. Kostet nichts.
 *  3. Ohne EIN Marktprofil ⇒ 409 `market_no_profiles`. Ein Bericht über null
 *     Marken wäre kein leerer Bericht, sondern eine erfundene Aussage über ein
 *     Feld, das niemand gelesen hat — und ein bezahlter Aufruf dafür.
 *  4. WIEDERVERWENDET: liegt zu GENAU diesem Stand (`revisionKey`: eigene
 *     Felder, Abrufstände und Auswertungen der Kandidaten, Version der
 *     Bibliothek) schon ein Bericht ⇒ ihn SOFORT zurück, 200, ohne Sperre,
 *     ohne Buchung, ohne Modell (§2.3 Nr. 5).
 *  5. KI aus ⇒ 409 `ai_disabled`, wie bisher.
 *  6. DIE SPERRE (`market_runs`, Art `report`, Gegenstand = das Branding) —
 *     VOR der Buchung. Läuft schon ein Bericht ⇒ 409 `run_running`, BEVOR der
 *     Zähler berührt wird.
 *  7. DER AUSSCHLUSS gegen den Vergleichs-Lauf (s. u.) ⇒ 409
 *     `comparison_running`, Sperre zurück.
 *  8. DAS KONTINGENT — oder die geerbte Buchung eines abgebrochenen,
 *     unbezahlten Vorgängers. Lehnt es ab ⇒ Sperre zurück (`dropRunLease`),
 *     429 wie bisher.
 *  9. 202 mit dem Lauf-Stand; der Lauf rechnet hinter der Antwort mit Besitzer
 *     (`runDetached`). Der `event` reist mit und wird dort nur LESEND benutzt.
 *
 * ── WARUM BERICHT UND VERGLEICHS-LAUF EINANDER AUSSCHLIESSEN ─────────────
 * Ja, in beide Richtungen. Der Bericht LIEST, was der Vergleichs-Lauf gerade
 * SCHREIBT (`market_profiles` und die Abrufstände in `market_competitors`):
 * mitten im Lauf gerechnet, beschriebe er ein halb erneuertes Feld und wäre
 * Sekunden später überholt — bezahlt. Und der Vergleichs-Lauf mit `withReport`
 * schreibt selbst einen Bericht: zwei gleichzeitige Berichte räumen sich
 * gegenseitig die offenen Markt-Befunde weg (`writeMarketFindings`) und
 * buchen zweimal. Die beiden Sperren haben verschiedene Zeilen-Ids; der
 * Ausschluss sieht deshalb NACH dem Nehmen der eigenen Sperre nach der
 * anderen Art (Begründung an `refuseWhileMarketRunActive`).
 *
 * ── WOHER DIE SEITE DEN AUSGANG KENNT ────────────────────────────────────
 * Aus der Lauf-Zeile, über `GET /report` (`reportRun`), gegen die SERVER-Uhr
 * gerechnet. Stirbt der Prozess, bleibt der Herzschlag stehen, und nach
 * `RUN_LEASE_STALL_MS` ist der Lauf `stalled` und wieder startbar.
 */
export default defineEventHandler(async (event): Promise<MarketReportResponse> => {
  const { userId, profileId, profile } = await requireMarketProfile(event)
  await requireMarketUnlocked(event, profileId)

  const [state, aiEnabled] = await Promise.all([
    loadMarketReportState(event, profileId),
    readBrandAiEnabled(event),
  ])

  if (state.withProfile === 0) {
    throw createError({
      status: 409,
      statusText: 'No market profiles to compare',
      data: { code: MARKET_NO_PROFILES_CODE },
    })
  }

  // (4) WIEDERVERWENDET — sofort, ohne Sperre.
  const existing = await marketReportForRevision(event, profileId, state.revisionKey)
  if (existing) {
    const [findings, reportRun] = await Promise.all([
      loadMarketFindings(event, profileId),
      readMarketReportRunView(event, profileId),
    ])
    return { report: toMarketReportView(existing, findings), stale: false, reused: true, aiEnabled, reportRun }
  }

  // (5)
  if (!aiEnabled) {
    throw createError({
      status: 409,
      statusText: 'AI is switched off',
      data: { code: MARKET_AI_DISABLED_CODE },
    })
  }

  // (6) DIE SPERRE — vor der Buchung.
  const store = marketRunStore(event)
  const { lease, previous, previousState } = await acquireRunLease(store, {
    scope: MARKET_REPORT_RUN_SCOPE,
    subject: profileId,
    detail: emptyMarketReportRunDetail({ withProfile: state.withProfile }),
  })

  // (7) DER AUSSCHLUSS gegen den Vergleichs-Lauf.
  await refuseWhileMarketRunActive(store, lease, {
    scope: MARKET_RUN_SCOPE,
    subject: profileId,
    code: MARKET_COMPARISON_RUNNING_CODE,
  })

  // (8) DAS KONTINGENT — oder die geerbte Buchung.
  const inherits = marketReportRunInheritsBooking(previousState, previous?.detail)
  if (inherits) {
    logEvent('info', 'market.report_booking_inherited', { previousSeq: previous?.seq ?? 0 })
  }
  else {
    let rejection: Awaited<ReturnType<typeof bookMarketReport>>
    try {
      rejection = await bookMarketReport(event, profileId)
    }
    catch (error) {
      // Der Zähler war nicht erreichbar — dann läuft auch nichts, und die
      // Sperre darf den Gegenstand nicht zwei Minuten lang festhalten.
      await dropRunLease(store, lease)
      throw error
    }
    if (rejection) {
      await dropRunLease(store, lease)
      setResponseHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Too many market reports',
        data: { code: rejection.code },
      })
    }
  }

  // (9) Der Lauf BEGINNT.
  logEvent('info', 'market.report_run_started', { withProfile: state.withProfile, inherited: inherits })
  runDetached('market-report', () => runMarketReport(event, {
    store,
    lease,
    userId,
    profileId,
    contentLocale: profile.contentLocale,
    booked: true,
  }))

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return {
    report: null,
    stale: false,
    reused: false,
    aiEnabled,
    reportRun: toMarketReportRunView(lease, Date.parse(lease.startedAt) || Date.now()),
  }
})
