import type { BrandProfilePurgeResponse } from '../../../../../shared/types/brand'
import { purgeBrandProfile } from '../../../../utils/brandProfileTrash'
import { loadOwnedTrashedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * „JETZT ENDGÜLTIG LÖSCHEN" (WH1) — im Papierkorb, für wen nicht 90 Tage
 * warten will. Der Vorschlag aus dem Plan: nur nach frischer Anmeldung
 * (`requireRecentAuth` ⇒ 403 `reauth_required`), weil der Schritt sich nicht
 * umkehren lässt.
 *
 * Nur eine Marke im Papierkorb (eine lebende ist hier 404 — der Weg zum
 * Löschen führt immer über den Papierkorb). Danach läuft dieselbe Kaskade wie
 * im Lauf nach 90 Tagen.
 */
export default defineEventHandler(async (event): Promise<BrandProfilePurgeResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  await requireRecentAuth(event)
  await loadOwnedTrashedProfile(event, userId, profileId)

  await purgeBrandProfile(event, profileId)
  return { purged: true }
})
