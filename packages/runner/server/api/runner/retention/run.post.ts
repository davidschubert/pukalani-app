import { z } from 'zod'
import type { RunRetentionResult } from '../../../../shared/runRetention'
import { runRetentionMode, runRunRetention } from '../../../utils/runRetention'

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
}).optional()

/**
 * AUFRÄUM-LAUF JETZT LAUFEN LASSEN (Ops/Verifikation, BE-025) — dasselbe Paar
 * aus Plugin und Handroute wie beim Label-Abgleich, aus demselben Grund: ein
 * Lauf, den man nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * `runner.manage`-gated (Betreiber, wie das Board).
 *
 * Body `{ dryRun?: boolean }`, Standard `true` (nur zählen). `dryRun: false`
 * löscht NUR, wenn der Schalter `pukalani.runner.retention` auf `apply` steht
 * — sonst 409 `run_retention_not_apply`: die Handroute ist kein Weg am
 * Schalter vorbei. Ein Probelauf geht immer, auch bei `off` (er liest nur).
 *
 * Gebremst in `core/server/middleware/05.rate-limit.ts` (`runner:retention`):
 * jeder Lauf blättert bis zu einigen tausend Einträge durch.
 *
 * Antwort: nur Zahlen, keine Ids.
 */
export default defineEventHandler(async (event): Promise<RunRetentionResult> => {
  requirePermission(event, 'runner.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const dryRun = body?.dryRun ?? true

  if (!dryRun && runRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Run retention is not switched to apply',
      data: { code: 'run_retention_not_apply' },
    })
  }

  return await runRunRetention(dryRun ? 'dry-run' : 'apply')
})
