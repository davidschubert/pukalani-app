import { BRAND_INSPIRATION_MAX } from '../../../../../../shared/brandInspiration'
import type { BrandInspirationWriteResponse } from '../../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../../utils/brandEvents'
import {
  deleteBrandInspiration,
  listBrandInspiration,
  loadBrandInspirationRow,
  requireBrandInspirationContext,
  syncBrandInspirationSlot,
} from '../../../../../utils/brandInspirationStore'

/**
 * EIN VORBILD ENTFERNEN (Konzept §2.2 Schritt 2, Paket D2a).
 *
 * ── HIER WIRD WIRKLICH GELÖSCHT ───────────────────────────────────────────
 * Kein `deactivated`, kein Papierkorb — anders als bei den Sessions (§3e:
 * „entfallene Daten werden INAKTIV"). Der Grund ist §2.13: Vorbilder sind
 * FREMDWERKE. Was der Kunde zurücknimmt, soll weg sein, und ein „gelöschtes"
 * Bild, das im Bucket weiterliegt, wäre die schlechteste Zusage von allen.
 * Die Zeile geht zuerst, die Datei danach (Begründung in
 * `deleteBrandInspiration`).
 *
 * DIE NUMMERN RÜCKEN NICHT NACH: wer Vorbild 2 von dreien entfernt, hat danach
 * 1 und 3. Eine Nummer, die nach einem Löschvorgang ein anderes Bild meint,
 * macht aus jeder Begründung der Lesung (D2b) eine Verwechslung.
 */
export default defineEventHandler(async (event): Promise<BrandInspirationWriteResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId || fileId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  // Erst belegen, dass die Zeile zu DIESER Marke gehört (Datentür-Regel) —
  // sonst wäre eine geratene Id ein Löschknopf für fremde Bilder.
  const row = await loadBrandInspirationRow(event, profile.$id, fileId)
  await deleteBrandInspiration(event, profile.$id, fileId)

  const items = await listBrandInspiration(event, profile.$id)
  await syncBrandInspirationSlot(event, profile, stepRows, items)

  await recordBrandEvent(event, {
    type: 'design.inspiration.removed',
    profileId: profile.$id,
    userId,
    payload: { area: row.area, count: items.length },
  })

  return { ok: true, item: null, items, max: BRAND_INSPIRATION_MAX }
})
