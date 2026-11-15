import { z } from 'zod'
import { requireBrandCheckOperator } from '../../../../utils/brandCheckAdmin'
import {
  brandCheckErasureMode,
  runBrandCheckErasure,
  type BrandCheckErasureResult,
} from '../../../../utils/brandCheckErasureRun'

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
}).optional()

/**
 * LÖSCH-LAUF DER PRÜFERGEBNISSE JETZT LAUFEN LASSEN (Ops/Verifikation,
 * SEC-015/SEC-026) — dasselbe Paar aus Plugin und Handroute wie beim
 * Aufräum-Lauf des Runners: ein Lauf, den man nur durch Warten beobachten
 * kann, wird nie bewiesen.
 *
 * Betreiber-Tor wie die übrigen brand-Admin-Routen (`users.manage`), VOR
 * jedem Lesen.
 *
 * Body `{ dryRun?: boolean }`, Standard `true` (nur zählen). `dryRun: false`
 * schreibt NUR, wenn der Schalter `pukalani.brand.checkErasure` auf `apply`
 * steht — sonst 409 `check_erasure_not_apply`: die Handroute ist kein Weg am
 * Schalter vorbei. Ein Probelauf geht immer, auch bei `off` (er liest nur).
 * Läuft gerade ein Lauf (Takt oder zweiter Klick) ⇒ 409 `check_erasure_busy`.
 *
 * Antwort: nur Zahlen, keine Ids.
 */
export default defineEventHandler(async (event): Promise<BrandCheckErasureResult> => {
  requireBrandCheckOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const dryRun = body?.dryRun ?? true

  if (!dryRun && brandCheckErasureMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Check erasure is not switched to apply',
      data: { code: 'check_erasure_not_apply' },
    })
  }

  const result = await runBrandCheckErasure(dryRun ? 'dry-run' : 'apply')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Check erasure is already running',
      data: { code: 'check_erasure_busy' },
    })
  }
  return result
})
