import { z } from 'zod'
import type { CommunityOwnerStatus } from '../../../../../shared/communityOwnerSlot'
import { listCommunityMembers } from '../../../../utils/communityTeam'
import { communityDisplayName, loadPoolCommunity } from '../../../../utils/communityOwnerSlot'

/**
 * WER IST INHABER DIESER COMMUNITY? (LA2, 2026-11-24) — die Lese-Hälfte des
 * Betreiber-Wegs „verwaister Inhaber-Platz".
 *
 * Nur lesen. Gate wie `team.post.ts` (Service-Secret, Projekt gegen die EINE
 * bediente Runtime geprüft, Community gegen dieses Projekt). Die Antwort nennt
 * die AKTIVEN Owner mit Row-Id und Runtime-Konto, aber keine Adresse — nur, ob
 * die Zeile noch eine trägt. Ob ein Konto noch lebt, weiß das Control Plane
 * nicht (es hat keinen Schlüssel für die Runtime): das prüft die Platform
 * selbst mit `users.get`.
 */
const bodySchema = z.object({
  runtimeProjectId: z.string().min(1).max(36),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<CommunityOwnerStatus> => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const runtimeProjectId = assertOnboardingRuntimeProject(event, body.runtimeProjectId)

  const tenant = await loadPoolCommunity(event, body.communityId, runtimeProjectId)
  const members = await listCommunityMembers(event, body.communityId, runtimeProjectId)

  return {
    communityName: communityDisplayName(tenant),
    communityStatus: tenant.status,
    owners: members
      .filter(member => member.status === 'active' && member.role === 'owner')
      .map(member => ({ memberId: member.$id, runtimeUserId: member.runtimeUserId, hasEmail: member.email !== '' })),
  }
})
