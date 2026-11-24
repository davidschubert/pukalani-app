import { z } from 'zod'
import type { CommunityOwnerSlotView } from '../../../../shared/communityOwnerSlot'
import { readOwnerSlot } from '../../../utils/communityOwnerSlot'

/**
 * HAT DIESE COMMUNITY NOCH EINEN LEBENDEN INHABER? (LA2, 2026-11-24)
 *
 * Die Prüf-Hälfte der Betreiber-Seite `/dashboard/community-owner`: Name der
 * Community, je Owner-Zeile „Konto gelöscht?", und ob der Platz verwaist ist.
 * Keine Kennungen, keine Adressen.
 *
 * BETREIBER-SACHE (`sites.manage`, dieselbe Fähigkeit wie die
 * Community-Verwaltung der Konsole). Liegt unter `/api/onboarding/`, weil
 * genau dieses Präfix auf dem Kontroll-Host offen ist (account.pukalani.app,
 * `controlApiPrefixes`). Auf einem Mandanten-Host 404 (N7): dort ist sie die
 * Verwaltung einer fremden Plattform.
 */
const querySchema = z.object({
  communityId: z.string().trim().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<CommunityOwnerSlotView> => {
  if (useTenant(event)) throw createError({ status: 404, statusText: 'Not found' })
  requirePermission(event, 'sites.manage')
  const query = await getValidatedQuery(event, querySchema.parse)

  const { view } = await readOwnerSlot(event, query.communityId)
  return view
})
