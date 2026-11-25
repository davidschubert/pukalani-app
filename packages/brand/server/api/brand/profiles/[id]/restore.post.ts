import type { BrandProfileRestoreResponse } from '../../../../../shared/types/brand'
import { restoreBrandProfile } from '../../../../utils/brandProfileTrash'
import { loadOwnedTrashedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * „ZURÜCKHOLEN" (WH1): eine Marke aus dem Papierkorb wieder in die Liste —
 * mit allen Kapiteln, Gesprächen, Bildern und Entwürfen und genau den
 * Prüfergebnissen, die das Löschen versteckt hat. Geteilte Links und die
 * Veröffentlichung kommen nicht zurück.
 *
 * Nur der Eigentümer, nur eine Marke im Papierkorb (sonst 404), nur in der
 * Frist (sonst 409 `trash_expired`).
 */
export default defineEventHandler(async (event): Promise<BrandProfileRestoreResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedTrashedProfile(event, userId, profileId)

  const { checksRestored } = await restoreBrandProfile(event, profile)
  logEvent('info', 'brand.profile_restored', { profileId, checksRestored })
  return { restored: true }
})
