import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../../core/shared/rowRetention'
import { brandProfileTrashMode, runBrandProfileTrash } from '../../../../utils/brandProfileTrash'

/**
 * DER LAUF DES PAPIERKORBS JETZT (WH1) — dasselbe Paar aus Takt und
 * Hand-Route wie bei den übrigen Fristen-Läufen des Layers: ein Lauf, den man
 * nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * Betreiber-Tor `users.manage`, VOR jedem Lesen. Body `{ apply?: boolean }`,
 * ohne Angabe wird NUR gezählt. `apply: true` löscht NUR, wenn der Schalter
 * `pukalani.brand.profileTrash` der App auf `apply` steht — sonst 409
 * `profile_trash_not_apply`: die Hand-Route ist kein Weg am Schalter vorbei.
 * Läuft gerade ein Lauf ⇒ 409 `profile_trash_busy`.
 *
 * Läuft MIT dem Ereignis der Anfrage (nicht dem anfragelosen des Takts).
 * Antwort: nur die Zahlen des Laufs.
 */
const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requirePermission(event, 'users.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && brandProfileTrashMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Brand profile trash is not switched to apply',
      data: { code: 'profile_trash_not_apply' },
    })
  }

  const result = await runBrandProfileTrash(apply ? 'apply' : 'count', { event })
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Brand profile trash run is already running',
      data: { code: 'profile_trash_busy' },
    })
  }
  return result
})
