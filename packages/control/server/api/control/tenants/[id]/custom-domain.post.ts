import { z } from 'zod'
import type { CustomDomainApprovalResponse } from '../../../../../shared/customDomain'
import { setCustomDomainApproval } from '../../../../utils/communityDomainApproval'

/**
 * Betreiber: eigene Domain einer Community FREIGEBEN oder die Freigabe
 * ENTZIEHEN (control-040, SEC-022).
 *
 * EIGENE ROUTE wie `suspension.post.ts` und aus demselben Grund: sie trifft den
 * Kunden sofort spürbar (ein Entzug schaltet eine aktive Domain ab) und gehört
 * an eine Adresse, die man beim Lesen des Codes findet. Regel und Protokoll:
 * `server/utils/communityDomainApproval.ts`.
 */
const bodySchema = z.object({
  approved: z.boolean(),
}).strict()

export default defineEventHandler(async (event): Promise<CustomDomainApprovalResponse> => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing community id' })

  const body = await readValidatedBody(event, bodySchema.parse)
  return await setCustomDomainApproval(event, { communityId: id, approved: body.approved })
})
