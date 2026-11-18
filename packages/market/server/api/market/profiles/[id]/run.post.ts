import type { MarketRunResponse } from '../../../../../shared/types/marketApi'
import type { MarketRunDetail } from '../../../../../shared/marketRun'
import {
  MARKET_RUN_SCOPE,
  emptyMarketRunDetail,
  marketRunInheritsBooking,
  noMarketRunView,
} from '../../../../../shared/marketRun'
import { readBrandAiEnabled } from '../../../../contracts/brandContract'
import { type MarketRouteContext, requireMarketProfile, requireMarketUnlocked } from '../../../../utils/marketAccess'
import { bookMarketRun } from '../../../../utils/marketQuota'
import { listMarketCompetitors } from '../../../../utils/marketStore'
import { marketRunStore, runMarketComparison } from '../../../../utils/marketRun'
import { refuseWhileMarketRunActive } from '../../../../utils/marketReportRun'
import { MARKET_REPORT_RUNNING_CODE, MARKET_REPORT_RUN_SCOPE } from '../../../../../shared/marketReportRun'

/**
 * DER LAUF (Plan §2.3 Schritte 2–3, §7.5; MV1 M2) — seit GA1 P18 (BE-008)
 * eine dünne Route: sie prüft, sperrt, bucht und antwortet 202. Gerechnet
 * wird dahinter (`server/utils/marketRun.ts`).
 *
 * ── WAS DER LAUF TUT UND WAS NICHT ────────────────────────────────────────
 * Er holt (Schritt 2), wertet aus (Schritt 3) und fragt die KI-Aussensicht
 * (§7.5). Den VERGLEICH macht er NUR AUF ANSAGE (`withReport`, MV1 M3).
 *
 * ── WARUM EIN FLAG UND KEIN AUTOMATISMUS ──────────────────────────────────
 * Aus Kundensicht gibt es EINEN Knopf („Markt vergleichen"), technisch sind es
 * zwei Schritte. Drei Wege wären denkbar gewesen, und zwei sind falsch:
 * (a) der Lauf hängt den Bericht IMMER an — dann kostet jeder Abruf-Lauf
 * einen Modell-Aufruf, auch wenn niemand einen Vergleich sehen will; (b) die
 * Oberfläche ruft immer beide Routen — dann muss sie den Fall „Lauf gut,
 * Bericht kaputt" selbst zusammensetzen. Gewählt ist (c): `withReport` ist
 * ein FLAG mit Default `false`. Fällt der Bericht aus, steht der Abruf
 * trotzdem.
 *
 * ── SEQUENTIELL, NICHT PARALLEL ───────────────────────────────────────────
 * Fünf Wettbewerber nacheinander. Parallel wäre schneller und wäre falsch:
 * jeder Kandidat holt bis zu acht Seiten von EINEM fremden Server, und
 * gleichzeitige Läufe machten aus einem Lesevorgang eine kleine Last. Ausserdem
 * teilt sich der Lauf EIN Zeichen-Budget (§2.8) — das lässt sich nur der Reihe
 * nach herunterrechnen.
 *
 * ── FAIL-SOFT JE KANDIDAT ─────────────────────────────────────────────────
 * Ein nicht erreichbarer Wettbewerber wird als `failed` vermerkt und der Lauf
 * geht weiter. Vier von fünf sind ein Vergleich; ein Abbruch wäre keiner.
 * Seit BE-011 gilt das auch, wenn der ABRUFSTAND eines Kandidaten sich nicht
 * schreiben lässt (überlange Adressen einer fremden Sitemap).
 *
 * ── IDEMPOTENZ ÜBER DEN ROHTEXT ───────────────────────────────────────────
 * Gleiches `inputHash` ⇒ kein zweiter Modell-Aufruf. Der Abruf läuft trotzdem
 * (die Website könnte sich geändert haben — das FESTZUSTELLEN ist ja gerade
 * der Zweck); die teure Hälfte spart der Hash.
 *
 * ════════════════════════════════════════════════════════════════════════
 * GA1 P18 (BE-008): DIE ANTWORT KOMMT SOFORT, DER LAUF RECHNET WEITER.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Bis P18 rechnete diese Route alles in EINER Anfrage — im schlechtesten Fall
 * viele Minuten, nginx wartet 60 s. Der Mensch sah einen Fehler, obwohl der
 * Lauf weiterlief und gelang; klickte er noch einmal, verbrauchte er einen
 * zweiten seiner drei Tagesläufe. Davids Entscheidung: „Der Marktvergleich
 * antwortet sofort und rechnet im Hintergrund; ein zweiter Klick startet
 * keinen zweiten Lauf." Vorbild ist der Video-Brief
 * (`insights/server/api/insights/watchlist/[videoId]/brief.post.ts`).
 *
 * ── DIE STUFEN, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  a. Ankunft loggen, Profil + Freischaltung prüfen, Flag lesen, Kandidaten
 *     laden. Keine Kandidaten ⇒ 200 `ran: false` — nichts gesperrt, nichts
 *     gebucht (was nichts kostet, kostet kein Kontingent).
 *  b. `aiEnabled` lesen — der Lauf trägt den Wert vom START, damit „KI ist
 *     aus" am Ende zu dem passt, was gelaufen ist.
 *  c. DIE SPERRE NEHMEN (`acquireRunLease`, Tabelle `market_runs`) — VOR der
 *     Buchung. Ein Doppelklick bucht damit nie zwei Läufe: der zweite Start
 *     bekommt 409 `run_running`, BEVOR er den Zähler berührt. Die Sperre hält
 *     auch zwei Anfragen in derselben Millisekunde auf (feste Zeilen-Id, der
 *     zweite `createRow` ist ein Konflikt — Kopf von `core/shared/runLease.ts`).
 *  c2. DER AUSSCHLUSS (LL1 d): rechnet auf demselben Branding gerade ein
 *     Bericht (`POST /report`), nimmt der Start seine Sperre zurück und
 *     antwortet 409 `report_running` — Begründung im Kopf von `report.post.ts`.
 *  d. DAS KONTINGENT. Normal: `bookMarketRun` wie bisher. AUSNAHME: übernimmt
 *     dieser Start einen ABGEBROCHENEN Lauf (`stalled`), der gebucht und noch
 *     NICHT bezahlt war, erbt er dessen Buchung und bucht nicht neu. Ein Lauf,
 *     der beim Ausliefern oder Absturz starb, bevor ein Modell-Aufruf begann,
 *     hat nichts gekostet und soll keinen der drei Tagesläufe verbrauchen;
 *     einer, der schon Geld gekostet hat (`paid`), bleibt gebucht. Lehnt das
 *     Kontingent ab ⇒ Sperre zurücknehmen (`dropRunLease`) und 429 wie
 *     bisher — sonst stünde der Knopf zwei Minuten lang auf „läuft".
 *  e. Start loggen, 202 mit dem Lauf-Stand, Lauf hinter der Antwort mit
 *     Besitzer (`runDetached`). Der `event` reist mit und wird dort nur
 *     LESEND benutzt (Runtime-Config, Admin-Client, KI-Schlüssel) — dasselbe
 *     ist beim Brief geprüft; in die Antwort schreibt niemand mehr.
 *
 * ── WOHER DIE SEITE DEN AUSGANG KENNT ────────────────────────────────────
 * Aus der Lauf-Zeile, über `GET /api/market/profiles/<id>` (`run`), gegen die
 * SERVER-Uhr gerechnet. Stirbt der Prozess, bleibt der Herzschlag stehen, und
 * nach `RUN_LEASE_STALL_MS` ist der Lauf `stalled` und wieder startbar — ohne
 * Aufräumer.
 */

export default defineEventHandler(async (event): Promise<MarketRunResponse> => {
  // (a) JEDER Ausgang vor dem Lauf hinterlässt eine Zeile (2026-09-07): ein
  // Lauf, der an einer Vorprüfung scheitert, antwortet 4xx — und 4xx
  // protokolliert der zentrale Handler nicht. Deshalb ZUERST die Ankunft (nur
  // die Tatsache, ob eine Session dranhängt), dann jeder Ablehnungsgrund als
  // CODE. Nie ein Inhalt, nie eine Id.
  logEvent('info', 'market.run_requested', { session: typeof event.context.user?.$id === 'string' })

  let userId: string, profileId: string, profile: MarketRouteContext['profile']
  try {
    ({ userId, profileId, profile } = await requireMarketProfile(event))
    await requireMarketUnlocked(event, profileId)
  }
  catch (error) {
    logEvent('info', 'market.run_rejected', { code: rejectionCodeOf(error) })
    throw error
  }

  // Das Flag darf aus der Adresszeile ODER dem Rumpf kommen: die Seite ruft
  // mit `?report=1`, ein Beweis bequemer mit Rumpf. Beides meint dasselbe.
  const query = getQuery(event)
  const body = await readBody(event).catch(() => null) as { withReport?: unknown } | null
  const withReport = query.report === '1' || query.report === 'true' || body?.withReport === true

  const competitors = await listMarketCompetitors(event, profileId)
  if (!competitors.length) {
    logEvent('info', 'market.run_rejected', { code: 'no_competitors' })
    return { ran: false, aiEnabled: await readBrandAiEnabled(event), run: null }
  }

  // (b)
  const aiEnabled = await readBrandAiEnabled(event)

  // (c) DIE SPERRE — vor der Buchung (s. Kopf).
  const store = marketRunStore(event)
  const initial: MarketRunDetail = emptyMarketRunDetail({
    total: competitors.length,
    withReport,
    aiEnabled,
  })
  let acquired: Awaited<ReturnType<typeof acquireRunLease>>
  try {
    acquired = await acquireRunLease(store, { scope: MARKET_RUN_SCOPE, subject: profileId, detail: initial })
  }
  catch (error) {
    logEvent('info', 'market.run_rejected', { code: rejectionCodeOf(error) })
    throw error
  }
  const { lease, previous, previousState } = acquired

  // (c2) DER AUSSCHLUSS gegen den Bericht-Lauf (LL1 d): rechnet auf diesem
  // Branding gerade `POST /report`, wartet der Vergleich — er schriebe die
  // Marktprofile neu, über die der Bericht gerade rechnet (Begründung im Kopf
  // von `report.post.ts`).
  try {
    await refuseWhileMarketRunActive(store, lease, {
      scope: MARKET_REPORT_RUN_SCOPE,
      subject: profileId,
      code: MARKET_REPORT_RUNNING_CODE,
    })
  }
  catch (error) {
    logEvent('info', 'market.run_rejected', { code: rejectionCodeOf(error) })
    throw error
  }

  // (d) DAS KONTINGENT — oder die geerbte Buchung (s. Kopf).
  const inherits = marketRunInheritsBooking(previousState, previous?.detail)
  if (inherits) {
    logEvent('info', 'market.run_booking_inherited', { previousSeq: previous?.seq ?? 0 })
  }
  else {
    let rejection: Awaited<ReturnType<typeof bookMarketRun>>
    try {
      rejection = await bookMarketRun(event, profileId)
    }
    catch (error) {
      // Der Zähler war nicht erreichbar — dann läuft auch nichts, und die
      // Sperre darf den Knopf nicht zwei Minuten lang festhalten.
      await dropRunLease(store, lease)
      throw error
    }
    if (rejection) {
      await dropRunLease(store, lease)
      logEvent('info', 'market.run_rejected', { code: rejection.code })
      setResponseHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Too many market runs',
        data: { code: rejection.code },
      })
    }
  }

  // (e) Der Lauf BEGINNT — ab dieser Zeile laufen Abrufe und Modell-Aufrufe,
  // auch wenn der Prozess mittendrin stirbt.
  logEvent('info', 'market.run_started', { competitors: competitors.length, withReport, aiEnabled, inherited: inherits })

  runDetached('market', () => runMarketComparison(event, {
    store,
    lease,
    userId,
    profileId,
    contentLocale: profile.contentLocale,
    competitors,
    withReport,
    aiEnabled,
    booked: true,
  }))

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return {
    ran: true,
    aiEnabled,
    run: {
      ...noMarketRunView(),
      state: 'running',
      startedAt: lease.startedAt,
      total: competitors.length,
      aiEnabled,
    },
  }
})

/** Der fachliche Grund einer Ablehnung (`data.code`) — sonst der HTTP-Status. */
function rejectionCodeOf(error: unknown): string {
  const data = (error as { data?: { code?: unknown } } | null)?.data
  if (data && typeof data.code === 'string') return data.code
  const status = (error as { status?: unknown, statusCode?: unknown } | null)
  const code = status?.status ?? status?.statusCode
  return typeof code === 'number' ? `http_${code}` : 'unknown'
}
