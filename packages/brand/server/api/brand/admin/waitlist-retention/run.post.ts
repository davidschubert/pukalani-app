import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../../core/shared/rowRetention'
import { requireBrandWaitlistOperator } from '../../../../utils/brandWaitlistAdmin'
import { brandWaitlistRetentionMode, runBrandWaitlistRetention } from '../../../../utils/brandWaitlistRetentionRun'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF DER WARTELISTE JETZT LAUFEN LASSEN (Ops/Verifikation, EL1 c) —
 * dasselbe Paar aus Plugin und Hand-Route wie beim Lösch-Lauf der
 * Prüfergebnisse: ein Lauf, den man nur durch Warten beobachten kann, wird
 * nie bewiesen.
 *
 * Betreiber-Tor wie die übrigen Wartelisten-Routen
 * (`requireBrandWaitlistOperator` = `users.manage`), VOR jedem Lesen.
 *
 * Body `{ apply?: boolean }`, ohne Angabe wird NUR gezählt. `apply: true`
 * löscht NUR, wenn der Schalter `pukalani.brand.waitlistRetention` der App auf
 * `apply` steht — sonst 409 `waitlist_retention_not_apply`: die Hand-Route ist
 * kein Weg am Schalter vorbei. Zählen geht immer, auch bei `off` (es liest
 * nur). Läuft gerade ein Lauf (Takt oder zweiter Klick) ⇒ 409
 * `waitlist_retention_busy`.
 *
 * Antwort: nur die Zahlen des Laufs, keine Ids, keine Adressen.
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requireBrandWaitlistOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && brandWaitlistRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Waitlist retention is not switched to apply',
      data: { code: 'waitlist_retention_not_apply' },
    })
  }

  const result = await runBrandWaitlistRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Waitlist retention is already running',
      data: { code: 'waitlist_retention_busy' },
    })
  }
  return result
})
