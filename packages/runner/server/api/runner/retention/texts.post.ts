import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../core/shared/rowRetention'
import { runRunTextRetention, runTextRetentionMode } from '../../../utils/runTextRetention'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF FÜR TEXTE UND ANHÄNGE JETZT LAUFEN LASSEN (RU1 c) — das Paar
 * aus Takt und Hand-Route wie beim Aufräum-Lauf daneben: ein Lauf, den man
 * nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * `runner.manage`-gated (Betreiber, wie das Board).
 *
 * Body `{ apply?: boolean }`. Ohne Angabe wird NUR GEZÄHLT (dieselbe Auswahl,
 * nichts geschrieben) — das geht immer, auch bei `off`. `apply: true`
 * schwärzt NUR, wenn der Schalter `pukalani.runner.textRetention` auf `apply`
 * steht — sonst 409 `run_text_retention_not_apply`: die Hand-Route ist kein
 * Weg am Schalter vorbei. Läuft schon einer (Takt oder Hand), 409
 * `run_text_retention_busy`.
 *
 * Antwort: nur Zahlen, keine Ids. `deleted` zählt GESCHWÄRZTE Läufe (die
 * Zeile bleibt).
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requirePermission(event, 'runner.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && runTextRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Run text retention is not switched to apply',
      data: { code: 'run_text_retention_not_apply' },
    })
  }

  const result = await runRunTextRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Run text retention is already running',
      data: { code: 'run_text_retention_busy' },
    })
  }
  return result
})
