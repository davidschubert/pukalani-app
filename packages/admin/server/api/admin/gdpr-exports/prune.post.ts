import { z } from 'zod'

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
}).optional()

/**
 * SICHERUNGSKOPIEN JETZT AUFRÄUMEN (Ops/Verifikation, SEC-009) — die
 * Handroute neben dem stündlichen Lauf (core/server/plugins/
 * gdpr-export-prune.ts), aus demselben Grund wie beim Label-Abgleich: ein
 * Lauf, den man nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * users.manage-gated wie die Nachbar-Routen dieser Liste. Body
 * `{ dryRun?: boolean }`, Standard `true` (nur zählen); `dryRun: false`
 * löscht, was älter als die Aufbewahrungsfrist ist — dasselbe, was der
 * stündliche Lauf ohnehin tut, also kein Weg an einer Entscheidung vorbei.
 *
 * Antwort: nur Anzahlen (`scanned`, `expired`, `removed`, `failed`), keine
 * Dateinamen — die tragen Konto-Kennungen. 409 `prune_busy`, wenn gerade ein
 * Lauf in diesem Prozess läuft. Ohne konfigurierten Bucket nur Nullen.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const dryRun = body?.dryRun ?? true

  const result = await runGdprExportPrune({ dryRun })
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'A cleanup run is already in progress',
      data: { code: 'prune_busy' },
    })
  }
  return result
})
