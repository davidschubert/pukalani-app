import { createBrandFindingsQuerySchema } from '../../../../../schemas/brandReview'
import type { BrandFindingsResponse } from '../../../../../shared/types/brand'
import { listBrandFindings, toBrandFindingView } from '../../../../utils/brandFindingsStore'
import { loadOwnedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * DIE BEFUNDE EINES BRANDINGS (BW2 Paket 4, Plan §8) — je PROFIL, nicht je
 * Kapitel.
 *
 * ── WARUM AM PROFIL UND NICHT AM BAUSTEIN ────────────────────────────────
 * Ein Konflikt verbindet zwei Felder, und die stehen ausdrücklich in
 * verschiedenen Kapiteln (`b.purpose` ↔ `c.conflictRule`). Eine Liste je
 * Kapitel müsste ihn zweimal ausliefern und könnte nicht sagen, welche der
 * beiden Zeilen „seine" ist. Wer nur ein Kapitel braucht, filtert im Browser
 * über `slots` — dieselbe Rechnung, die auch die Sperre der Finalen Abnahme
 * benutzt (`blockingFindingSlots`).
 *
 * ── `?status=` MIT DEFAULT `open` ────────────────────────────────────────
 * Der Normalfall ist „was ist noch offen". Erledigtes bekommt man auf
 * ausdrückliche Nachfrage; eine Liste, die standardmässig alles zeigt, wäre
 * nach dem zehnten abgelehnten Befund unlesbar.
 *
 * ── ZUGANG: DIE PROFIL-ZEILE IST DIE GRENZE ──────────────────────────────
 * `loadOwnedProfile` belegt den Besitz, bevor irgendetwas gelesen wird; die
 * Befund-Abfrage filtert danach ein zweites Mal auf dieselbe `profileId`. Zwei
 * Netze für dieselbe Grenze, weil die Tabelle server-only ist und ihre Zeilen
 * keine eigenen Rechte tragen.
 */
export default defineEventHandler(async (event): Promise<BrandFindingsResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  await loadOwnedProfile(event, userId, profileId)

  const query = createBrandFindingsQuerySchema().safeParse(getQuery(event))
  if (!query.success) {
    throw createError({ status: 400, statusText: 'Invalid status', data: { code: 'invalid_status' } })
  }

  const rows = await listBrandFindings(event, profileId, query.data.status)
  return { findings: rows.map(toBrandFindingView) }
})
