import { createBrandShareRevokeSchema } from '../../../../schemas/brandAccess'
import type { BrandShareRevokeResponse } from '../../../../shared/types/brand'
import {
  BRAND_SHARES_TABLE,
  brandDb,
  isAppwriteNotFound,
  listActiveShares,
  loadOwnedProfile,
} from '../../../utils/brandStore'
import { recordBrandEvent } from '../../../utils/brandEvents'

/**
 * EINEN LESE-LINK ZURÜCKNEHMEN.
 *
 * ── PRIVAT, OBWOHL SIE UNTER `/share` LIEGT ───────────────────────────────
 * Der Pfad-Nachbar `share/[token].get.ts` ist öffentlich, diese Route nicht:
 * Widerrufen darf nur der Eigentümer, und der wird über `profileId` belegt
 * (`loadOwnedProfile`), nicht über den Token. Der Token als Ausweis wäre hier
 * falsch herum — wer ihn hat, ist der EMPFÄNGER.
 *
 * ── OHNE `shareId` GEHT ALLES ─────────────────────────────────────────────
 * Der Knopf heisst „Link deaktivieren", und ein Profil kann nach einer
 * Rotation mehrere aktive Zeilen tragen. Die Hälfte stehen zu lassen wäre die
 * gefährlichste Antwort: der Mensch sähe „deaktiviert" und ein alter Link
 * funktionierte weiter.
 *
 * ── WIDERRUFEN, NICHT LÖSCHEN ─────────────────────────────────────────────
 * `revokedAt` bleibt stehen. Die Zeile ist der Nachweis, WAS wann geteilt
 * wurde — gelöscht wird sie erst mit dem Branding (Kaskade §7).
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────────
 * Nichts Aktives gefunden ⇒ `{ revoked: 0 }` mit 200. Ein zweiter Klick ist
 * kein Fehler.
 */
export default defineEventHandler(async (event): Promise<BrandShareRevokeResponse> => {
  const { userId } = await requireBrandAccess(event)
  const body = await readValidatedBody(event, createBrandShareRevokeSchema().parse)
  await loadOwnedProfile(event, userId, body.profileId)

  const active = await listActiveShares(event, body.profileId)
  // Ein `shareId`, das nicht zu DIESEM Profil gehört, findet sich hier nicht
  // wieder — die Filterung über die geladene Liste ist zugleich die Prüfung.
  const targets = body.shareId ? active.filter(row => row.$id === body.shareId) : active

  const { tablesDB, databaseId } = brandDb(event)
  const now = new Date().toISOString()
  let revoked = 0
  for (const row of targets) {
    try {
      await tablesDB.updateRow({
        databaseId, tableId: BRAND_SHARES_TABLE, rowId: row.$id, data: { revokedAt: now },
      })
      revoked++
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand share could not be revoked')
    }
  }

  // Nur, wenn wirklich etwas zuging: der zweite Klick ist idempotent (s. o.),
  // und ein Ereignis ohne Wirkung machte aus einer Messung eine Klickzählung.
  if (revoked > 0) {
    await recordBrandEvent(event, {
      type: 'share.revoked',
      profileId: body.profileId,
      userId,
      // Umfang, nicht Inhalt — und nie ein Token.
      payload: { revoked },
    })
  }

  return { revoked }
})
