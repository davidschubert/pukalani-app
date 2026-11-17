import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../core/shared/rowRetention'
import { runStaleRunRetention, staleRunRetentionMode } from '../../../utils/staleRunRetention'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF FÜR LÄUFE, DIE NIE BEENDET WURDEN, JETZT LAUFEN LASSEN (RU1 c)
 * — das Paar aus Takt und Hand-Route wie bei den beiden Läufen daneben: ein
 * Lauf, den man nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * `runner.manage`-gated (Betreiber, wie das Board).
 *
 * Body `{ apply?: boolean }`. Ohne Angabe wird NUR GEZÄHLT (dieselbe Auswahl,
 * nichts geschrieben) — das geht immer, auch bei `off`. `apply: true` beendet
 * NUR, wenn der Schalter `pukalani.runner.staleRunRetention` auf `apply` steht
 * — sonst 409 `stale_run_retention_not_apply`: die Hand-Route ist kein Weg am
 * Schalter vorbei. Läuft schon einer (Takt oder Hand), 409
 * `stale_run_retention_busy`.
 *
 * Antwort: nur Zahlen, keine Ids. `deleted` zählt BEENDETE Läufe (die Zeile
 * bleibt), `byReason` trennt Entwürfe (`stale-draft`) von hängenden Läufen
 * (`stale-active`).
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requirePermission(event, 'runner.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && staleRunRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Stale run retention is not switched to apply',
      data: { code: 'stale_run_retention_not_apply' },
    })
  }

  const result = await runStaleRunRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Stale run retention is already running',
      data: { code: 'stale_run_retention_busy' },
    })
  }
  return result
})
