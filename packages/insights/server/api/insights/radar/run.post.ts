import {
  INSIGHTS_RADAR_NOT_CONFIGURED_CODE,
  INSIGHTS_RADAR_RATE_LIMIT_CODE,
  INSIGHTS_RADAR_RUN_LIMIT,
  INSIGHTS_RADAR_RUN_WINDOW_MS,
  insightsRadarRunKey,
} from '../../../../shared/insightsRadar'
import { runInsightsRadarSweep } from '../../../utils/insightsRadarSweep'
import type { InsightsRadarRunResponse } from '../../../../shared/types/insightsApi'

/**
 * „JETZT LAUFEN LASSEN" — derselbe Lauf wie der nächtliche, auf Knopfdruck
 * (BI1 I4, §9.6).
 *
 * ── DIE KETTE, IN DIESER REIHENFOLGE ────────────────────────────────────
 *  1. `insights.manage` — Betreiber-Sache wie der ganze Layer.
 *  2. SCHLÜSSEL — 503 `not_configured`, wenn keiner da ist.
 *  3. DROSSEL — 3 Läufe je Stunde und Konto, 429 `rate_limited`.
 *  4. erst dann der Lauf.
 *
 * Der Schlüssel-Riegel steht VOR der Drossel, wörtlich aus demselben Grund
 * wie beim Kill-Switch in `insightsAi.ts`: ein Betriebszustand darf einem
 * Menschen nicht sein Kontingent kosten. Wer dreimal auf einen Knopf drückt,
 * der ohne Schlüssel gar nichts tun kann, soll danach nicht eine Stunde
 * gesperrt sein.
 *
 * ── WARUM SYNCHRON UND NICHT IM HINTERGRUND ─────────────────────────────
 * Der Knopf soll ZAHLEN zurückgeben — „12 Kanäle, 240 Videos, 240
 * geschrieben, 0 Fehler". Ein Lauf im Hintergrund bräuchte einen zweiten
 * Zustand („läuft gerade"), eine zweite Route zum Nachfragen und eine Antwort
 * auf die Frage, was passiert, wenn der Prozess dazwischen neu startet. Der
 * Lauf dauert bei zwölf Kanälen wenige Sekunden; der Sweep selbst hat ein
 * Modul-Flag gegen den Parallel-Lauf und antwortet dann `skipped: 'running'`.
 *
 * ── DIE ANTWORT IST DAS SWEEP-ERGEBNIS, UNVERÄNDERT ─────────────────────
 * Kein Umbau, keine Zusammenfassung: was der Lauf gezählt hat, ist genau das,
 * was der Betreiber wissen will. `skipped` sagt, wenn nichts passiert ist —
 * ein „0 Videos" ohne Grund sähe aus wie ein leerer Fund statt wie ein
 * fehlendes Gate.
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

  const { store, prefix } = useRateLimitStore(event)
  const hit = await store.hit(`${prefix}${insightsRadarRunKey(user.$id)}`, INSIGHTS_RADAR_RUN_WINDOW_MS)
  // `>` und nicht `>=`: gezählt wird beim START, der eigene Lauf steckt also
  // schon im Zählerstand (dieselbe Regel wie in `decideInsightsAiQuota`).
  if (hit.count > INSIGHTS_RADAR_RUN_LIMIT) {
    throw createError({
      status: 429,
      statusText: 'Too many requests',
      data: { code: INSIGHTS_RADAR_RATE_LIMIT_CODE },
    })
  }

  return await runInsightsRadarSweep({ event })
})
