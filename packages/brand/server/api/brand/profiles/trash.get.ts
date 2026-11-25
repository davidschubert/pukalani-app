import type { BrandProfileTrashListResponse } from '../../../../shared/types/brand'
import { listTrashedBrandProfiles } from '../../../utils/brandProfileTrash'

/**
 * „GELÖSCHTE MARKEN" (WH1): die Marken des Kontos im Papierkorb, mit Datum
 * und verbleibenden Tagen. Liegt neben `scores.get.ts` als feste Adresse vor
 * `[id]` — der Router nimmt den festen Namen zuerst.
 */
export default defineEventHandler(async (event): Promise<BrandProfileTrashListResponse> => {
  const { userId } = await requireBrandAccess(event)
  return { items: await listTrashedBrandProfiles(event, userId) }
})
