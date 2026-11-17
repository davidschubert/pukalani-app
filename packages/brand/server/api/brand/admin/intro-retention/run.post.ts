import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../../core/shared/rowRetention'
import { requireBrandIntroOperator } from '../../../../utils/brandIntroCall'
import { brandIntroRetentionMode, runBrandIntroRetention } from '../../../../utils/brandIntroRetentionRun'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF DER GESPRÄCHSANFRAGEN JETZT LAUFEN LASSEN (Ops/Verifikation,
 * EL1 c) — dasselbe Paar aus Plugin und Hand-Route wie beim Fristen-Lauf der
 * Warteliste: ein Lauf, den man nur durch Warten beobachten kann, wird nie
 * bewiesen.
 *
 * Betreiber-Tor wie die übrigen Routen der Gesprächsanfragen
 * (`requireBrandIntroOperator` = `users.manage`), VOR jedem Lesen.
 *
 * Body `{ apply?: boolean }`, ohne Angabe wird NUR gezählt. `apply: true`
 * löscht NUR, wenn der Schalter `pukalani.brand.introRequestRetention` der
 * App auf `apply` steht — sonst 409 `intro_retention_not_apply`: die
 * Hand-Route ist kein Weg am Schalter vorbei. Zählen geht immer, auch bei
 * `off` (es liest nur). Läuft gerade ein Lauf (Takt oder zweiter Klick) ⇒ 409
 * `intro_retention_busy`.
 *
 * Antwort: nur die Zahlen des Laufs, keine Ids, keine Namen, keine Adressen.
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requireBrandIntroOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && brandIntroRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Intro request retention is not switched to apply',
      data: { code: 'intro_retention_not_apply' },
    })
  }

  const result = await runBrandIntroRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Intro request retention is already running',
      data: { code: 'intro_retention_busy' },
    })
  }
  return result
})
