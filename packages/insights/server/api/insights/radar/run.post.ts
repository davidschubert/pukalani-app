import {
  INSIGHTS_RADAR_NOT_CONFIGURED_CODE,
  INSIGHTS_RADAR_RATE_LIMIT_CODE,
  INSIGHTS_RADAR_RUN_LIMIT,
  INSIGHTS_RADAR_RUN_WINDOW_MS,
  insightsRadarRunKey,
} from '../../../../shared/insightsRadar'
import { INSIGHTS_RADAR_RUN_SCOPE, INSIGHTS_RADAR_RUN_SUBJECT } from '../../../../shared/insightsRadarRun'
import type { InsightsRadarRunResponse } from '../../../../shared/types/insightsApi'
import { insightsRadarRunStore, runInsightsRadarInBackground } from '../../../utils/insightsRadarRun'

/**
 * „JETZT LAUFEN LASSEN" — derselbe Lauf wie der nächtliche, auf Knopfdruck
 * (BI1 I4, §9.6). Seit LL1 a (2026-11-17) eine dünne Route: sie prüft,
 * sperrt, zählt und antwortet 202. Gerechnet wird dahinter
 * (`server/utils/insightsRadarRun.ts`), die Seite fragt den Stand über
 * `GET /api/insights/radar` (`run`) ab.
 *
 * ── DIE KETTE, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  1. `insights.manage` — Betreiber-Sache wie der ganze Layer.
 *  2. SCHLÜSSEL — 503 `not_configured`, wenn keiner da ist. VOR allem
 *     anderen, wörtlich aus demselben Grund wie beim Kill-Switch in
 *     `insightsAi.ts`: ein Betriebszustand darf einem Menschen nicht sein
 *     Kontingent kosten, und ohne Schlüssel gibt es nichts zu sperren.
 *  3. SPERRE — `acquireRunLease` (Art `radar`, ein FESTER Gegenstand, denn es
 *     gibt nur einen Radar je Instanz). Läuft schon einer, kommt 409
 *     `run_running`, BEVOR der Zähler berührt wird: ein Doppelklick kostet
 *     keinen der drei Läufe je Stunde. Die Sperre hält auch zwei Anfragen in
 *     derselben Millisekunde auf (feste Zeilen-Id, Kopf von
 *     `core/shared/runLease.ts`).
 *  4. DROSSEL — 3 Läufe je Stunde und Konto, 429 `rate_limited`. Lehnt sie
 *     ab oder ist der Zähler nicht erreichbar, fällt die Sperre wieder
 *     (`dropRunLease`) — sonst stünde der Knopf zwei Minuten auf „läuft".
 *  5. 202 mit dem Lauf-Stand, der Lauf hinter der Antwort mit Besitzer
 *     (`runDetached`).
 *
 * ── WARUM NICHT MEHR IN DER ANFRAGE (LL1 a) ─────────────────────────────
 * Bis hierher lief der Sweep IN der Anfrage, mit einer Abruf-Frist von 30 s,
 * damit die Antwort vor den 60 s des Webservers ankam (GA1 P18). Bei einer
 * langsamen API war das Ergebnis dann ein Teil, und ein zweiter Klick startete
 * einen zweiten Lauf, sobald der erste aus der Anfrage gefallen war. Jetzt
 * läuft der Knopf-Lauf wie der nächtliche ohne Frist; die einzige Bremse ist
 * der Haken, der nach verlorenem Herzschlag keine neuen Abrufe mehr beginnt.
 *
 * ── WAS DIE ANTWORT SAGT ────────────────────────────────────────────────
 * Nur „angenommen". Die Zahlen des Laufs (unverändert das Sweep-Ergebnis,
 * samt `skipped`) stehen danach im `detail` der Lauf-Zeile.
 */
export default defineEventHandler(async (event): Promise<InsightsRadarRunResponse> => {
  const user = requirePermission(event, 'insights.manage')

  if (!useRuntimeConfig(event).insightsYoutubeKey) {
    throw createError({
      status: 503,
      statusText: 'Radar not configured',
      data: { code: INSIGHTS_RADAR_NOT_CONFIGURED_CODE },
    })
  }

  // (3) DIE SPERRE — vor der Drossel (s. Kopf).
  const store = insightsRadarRunStore(event)
  const { lease } = await acquireRunLease(store, {
    scope: INSIGHTS_RADAR_RUN_SCOPE,
    subject: INSIGHTS_RADAR_RUN_SUBJECT,
  })

  // (4) DIE DROSSEL.
  let count: number
  try {
    const { store: limits, prefix } = useRateLimitStore(event)
    count = (await limits.hit(`${prefix}${insightsRadarRunKey(user.$id)}`, INSIGHTS_RADAR_RUN_WINDOW_MS)).count
  }
  catch (error) {
    // Der Zähler war nicht erreichbar — dann läuft auch nichts.
    await dropRunLease(store, lease)
    throw error
  }
  // `>` und nicht `>=`: gezählt wird beim START, der eigene Lauf steckt also
  // schon im Zählerstand (dieselbe Regel wie in `decideInsightsAiQuota`).
  if (count > INSIGHTS_RADAR_RUN_LIMIT) {
    await dropRunLease(store, lease)
    throw createError({
      status: 429,
      statusText: 'Too many requests',
      data: { code: INSIGHTS_RADAR_RATE_LIMIT_CODE },
    })
  }

  // (5) Der Lauf BEGINNT.
  logEvent('info', 'insights.radar_run_started', {})
  runDetached('insights-radar', () => runInsightsRadarInBackground(event, { store, lease }))

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return {
    run: { state: 'running', startedAt: lease.startedAt, finishedAt: '', result: null },
  }
})
