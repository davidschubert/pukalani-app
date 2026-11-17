import { z } from 'zod'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * PROFILBILDER OHNE PROFIL JETZT AUFRÄUMEN (KE3) — die Hand-Route neben dem
 * Lauf alle 6 Stunden (core/server/plugins/avatar-orphan-sweep.ts), aus
 * demselben Grund wie bei den Lösch-Kopien: ein Lauf, den man nur durch
 * Warten beobachten kann, wird nie bewiesen.
 *
 * storage.manage-gated wie das Löschen einer Datei im Storage-Browser
 * (`admin/storage/[bucket]/[fileId].delete.ts`) — der Lauf löscht Dateien. Body
 * `{ apply?: boolean }`, ohne Angabe wird NUR GEZÄHLT. `apply: true` löscht
 * nur, wenn der Schalter der App (`pukalani.storage.avatarOrphanSweep`)
 * selbst auf `apply` steht — sonst 409 `sweep_not_enabled`: die Route ist
 * kein Weg an der Entscheidung des Betreibers vorbei.
 *
 * Antwort: nur Zahlen, keine Datei- oder Konto-Ids. 409 `sweep_busy`, wenn
 * gerade ein Lauf in diesem Prozess läuft (Takt und Route teilen die
 * Sperre). Ohne Avatars-Bucket nur Nullen.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'storage.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && avatarOrphanSweepMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Deleting is not enabled for this app',
      data: { code: 'sweep_not_enabled' },
    })
  }

  const result = await runAvatarOrphanSweep(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'A cleanup run is already in progress',
      data: { code: 'sweep_busy' },
    })
  }
  return {
    mode: result.mode,
    considered: result.considered,
    expired: result.expired,
    deleted: result.deleted,
    failed: result.failed,
    truncated: result.truncated,
    byReason: result.byReason,
    unowned: result.unowned,
    keptAtDelete: result.keptAtDelete,
  }
})
