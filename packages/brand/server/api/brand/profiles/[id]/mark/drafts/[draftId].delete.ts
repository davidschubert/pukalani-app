import { BRAND_MARK_DRAFTS_MAX } from '../../../../../../../shared/brandMarkDrafts'
import type { BrandMarkDraftWriteResponse } from '../../../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import {
  deleteBrandMarkDraft,
  listBrandMarkDrafts,
  loadBrandMarkDraftRow,
  syncBrandMarkDraftsSlot,
} from '../../../../../../utils/brandMarkDrafts'

/**
 * EINEN ENTWURF VERWERFEN (Konzept §2.5 Stufe 3, Paket D5c).
 *
 * ── VERWERFEN LÖSCHT WIRKLICH ────────────────────────────────────────────
 * Anders als beim Entfernen eines Mitglieds („Entfernen löscht nicht",
 * CLAUDE.md) ist hier das Löschen die richtige Antwort: ein verworfener
 * Entwurf ist eine Idee, die der Mensch NICHT weiterverfolgen will, und ein
 * unfertiger Logo-Vorschlag, der als Karteileiche liegen bleibt, ist genau der
 * Rest, gegen den §2.13 geschrieben ist. Zeile UND Datei gehen (die
 * Reihenfolge steht in `deleteBrandMarkDraft`).
 *
 * ── DIE ZUGEHÖRIGKEIT WIRD VORHER BELEGT ─────────────────────────────────
 * `loadBrandMarkDraftRow` — eine fremde oder erfundene Zeilen-Id endet mit 404,
 * bevor irgendetwas gelöscht wird.
 *
 * ── DER SLOT ZIEHT MIT ───────────────────────────────────────────────────
 * War der Entwurf behalten, verschwindet er aus `j.drafts`; war er der letzte
 * behaltene, verschwindet der Slot ganz (s. `syncBrandMarkDraftsSlot`).
 */
export default defineEventHandler(async (event): Promise<BrandMarkDraftWriteResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandMarkContext(event, userId, betaAccount)

  const draftId = getRouterParam(event, 'draftId')
  if (!draftId || draftId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  await loadBrandMarkDraftRow(event, profile.$id, draftId)
  await deleteBrandMarkDraft(event, profile.$id, draftId)

  const items = await listBrandMarkDrafts(event, profile.$id)
  await syncBrandMarkDraftsSlot(event, profile, stepRows, items)

  await recordBrandEvent(event, {
    type: 'design.drafts.discarded',
    profileId: profile.$id,
    userId,
    payload: { total: items.length, kept: items.filter(entry => entry.kept).length },
  })

  return { ok: true, item: null, items, max: BRAND_MARK_DRAFTS_MAX }
})
