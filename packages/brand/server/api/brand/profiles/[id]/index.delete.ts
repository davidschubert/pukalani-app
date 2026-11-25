import type { BrandProfileDeleteResponse } from '../../../../../shared/types/brand'
import { trashBrandProfile } from '../../../../utils/brandProfileTrash'
import { BRAND_PROFILES_TABLE, type BrandProfileRow, brandDb, isAppwriteNotFound, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * „MARKE LÖSCHEN" (WH1, Davids Entscheidung 2026-11-15): die Marke kommt in
 * den Papierkorb. Sie verschwindet sofort aus jedem Weg, liegt 90 Tage unter
 * „Gelöschte Marken" und wird danach von einem Lauf endgültig gelöscht. Was
 * genau geschieht und in welcher Reihenfolge: `trashBrandProfile`
 * (`server/utils/brandProfileTrash.ts`). Bis WH1 löschte diese Route sofort
 * alles — diese Kaskade heisst jetzt `purgeBrandProfile`.
 *
 * ── AUCH EINE SCHON GELÖSCHTE MARKE ───────────────────────────────────────
 * Die Route liest die Zeile selbst statt über `loadOwnedProfile` (das eine
 * gelöschte Marke als 404 meldet): scheiterte beim ersten Mal ein späterer
 * Schritt (Links, Veröffentlichung ⇒ 502), versucht ein zweiter Aufruf es
 * erneut, ohne die Frist neu beginnen zu lassen. Die Besitz-Prüfung ist
 * dieselbe (`assertBrandOwnerAccess`) — ohne sie wäre eine fremde Id ein
 * Löschknopf.
 */
export default defineEventHandler(async (event): Promise<BrandProfileDeleteResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)

  const { tablesDB, databaseId } = brandDb(event)
  let profile: BrandProfileRow
  try {
    profile = await tablesDB.getRow<BrandProfileRow>({ databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw toH3Error(error, 'Brand profile could not be loaded')
  }
  assertBrandOwnerAccess(event, profile, userId)

  const outcome = await trashBrandProfile(event, profile)
  logEvent('info', 'brand.profile_trashed', {
    profileId,
    checksErased: outcome.checksErased,
    shares: outcome.shares,
    publicationWithdrawn: outcome.publicationWithdrawn,
  })
  return { trashed: true, erasedAt: outcome.erasedAt, purgeAt: outcome.purgeAt }
})
