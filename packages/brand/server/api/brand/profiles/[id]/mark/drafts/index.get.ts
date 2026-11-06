import { BRAND_MARK_DRAFTS_MAX } from '../../../../../../../shared/brandMarkDrafts'
import type { BrandMarkDraftsListResponse } from '../../../../../../../shared/types/brand'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import { listBrandMarkDrafts } from '../../../../../../utils/brandMarkDrafts'

/**
 * DIE ENTWÜRFE EINER MARKE LESEN (Paket D5c).
 *
 * Dieselben drei Schranken wie an jeder anderen Route dieser Fläche
 * (`requireBrandMarkContext`): Zugang, Besitz der Marke, Kapitel auf dem Weg.
 * Alle antworten mit 404 — es gibt hier keine Seite, die etwas erklären würde,
 * also gibt es auch nichts zu verraten.
 *
 * OHNE BILD-MODELL ANTWORTET SIE TROTZDEM 200 mit dem, was da liegt: die
 * Entwürfe von gestern verschwinden nicht, weil der Betreiber heute das Modell
 * ausgetragen hat. Das 503 gehört dem LAUF, nicht der Liste.
 */
export default defineEventHandler(async (event): Promise<BrandMarkDraftsListResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile } = await requireBrandMarkContext(event, userId, betaAccount)
  return {
    items: await listBrandMarkDrafts(event, profile.$id),
    max: BRAND_MARK_DRAFTS_MAX,
  }
})
