import { z } from 'zod'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { requireCommunityTeamContext } from '../../../../utils/communityTeam'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Eine offene Einladung widerrufen — der Link stirbt sofort.
 *
 * Die Row wird auf 'revoked' gesetzt, nicht gelöscht: die Spur „wer hat wen
 * eingeladen und es wieder zurückgenommen" ist bei einem Missbrauchsverdacht
 * genau das, was man sucht. Angezeigt wird sie nicht mehr (die Liste zeigt nur
 * pending).
 *
 * Die Einladung wird GEZIELT geholt und dann gegen diese Community geprüft:
 * gehört sie zu einer anderen Community, ist sie unbekannt oder nicht mehr
 * offen, ist die Antwort dieselbe 404. (Bis SEC-028 wurde sie in der
 * Anzeige-Liste gesucht — die ist auf 100 gekappt, und jede ältere offene
 * Einladung liess sich dann nicht mehr zurückziehen.)
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  inviteId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'team.manage')

  const admin = createAdminClient(event)
  const invite = await admin.tablesDB.getRow<CommunityInviteRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    rowId: body.inviteId,
  }).catch(softFail('control:api/control/community/invites/revoke.post:getRow', null))
  if (!invite || invite.communityId !== body.communityId || invite.status !== 'pending') {
    throw createError({ status: 404, statusText: 'Invitation not found' })
  }

  const row = await admin.tablesDB.updateRow<CommunityInviteRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    rowId: invite.$id,
    data: { status: 'revoked' },
  }).catch((error) => { throw toH3Error(error, 'Could not revoke invitation') })

  logEvent('info', 'site.invite_revoked', {
    communityId: body.communityId,
    inviteId: row.$id,
    actor: context.identity.userId,
  })

  return { ok: true, inviteId: row.$id, status: row.status }
})
