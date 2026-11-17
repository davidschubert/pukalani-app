import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../../../packages/core/shared/rowRetention'
import { introRequestRetentionMode, runIntroRequestRetention } from '../../../../utils/introRequestRetentionRun'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF DER GESPRÄCHSANFRAGEN JETZT LAUFEN LASSEN (Ops/Verifikation,
 * EL1 c) — dasselbe Paar aus Plugin und Hand-Route wie bei den übrigen
 * Fristen-Läufen: ein Lauf, den man nur durch Warten beobachten kann, wird
 * nie bewiesen.
 *
 * Tor `users.manage` (wie die Hand-Route der Gesprächsanfragen auf
 * branding.supply und das Aufräumen der Sicherungskopien), VOR jedem Lesen.
 *
 * Body `{ apply?: boolean }`, ohne Angabe wird NUR gezählt. `apply: true`
 * löscht NUR, wenn der Schalter `pukalani.portfolio.introRequestRetention`
 * auf `apply` steht — sonst 409 `intro_retention_not_apply`: die Hand-Route
 * ist kein Weg am Schalter vorbei. Zählen geht immer, auch bei `off` (es liest
 * nur). Läuft gerade ein Lauf (Takt oder zweiter Klick) ⇒ 409
 * `intro_retention_busy`.
 *
 * Antwort: nur die Zahlen des Laufs, keine Ids, keine Namen, keine Adressen.
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requirePermission(event, 'users.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && introRequestRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Intro request retention is not switched to apply',
      data: { code: 'intro_retention_not_apply' },
    })
  }

  const result = await runIntroRequestRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Intro request retention is already running',
      data: { code: 'intro_retention_busy' },
    })
  }
  return result
})
