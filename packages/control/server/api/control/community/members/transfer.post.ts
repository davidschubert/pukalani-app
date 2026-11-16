import { z } from 'zod'
import { decideTransfer } from '../../../../../shared/communityTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../../shared/types/communityMember'
import { memberFacts, requireCommunityTeamContext, throwOnDenied } from '../../../../utils/communityTeam'
import { withControlLock } from '../../../../utils/controlLock'

/**
 * Besitz übertragen (Davids Entscheidung 3 vom 2026-07-29: JA). Das Löschen
 * einer Community war dort bewusst vertagt und ist seit C16 (2026-07-31)
 * gebaut — als eigene Route `community/delete.post.ts`, und mit einem Schnitt,
 * der den damaligen Einwand auflöst: stilllegen statt vernichten.
 *
 * Autorisiert über `community.transfer` — eine OWNER-Capability. Das ist der Grund,
 * warum die Rollen-Route 'owner' verweigert: sonst wäre Besitz über eine
 * Admin-Capability erreichbar.
 *
 * Danach ist der Übertragende ADMIN, nicht mehr Owner — und nicht draußen. Beide
 * Schreibvorgänge in einer Reihenfolge, die keinen ownerlosen Zustand erzeugt:
 * erst das ZIEL zum Owner (jetzt gibt es zwei), dann sich selbst zurückstufen.
 * Die umgekehrte Reihenfolge könnte eine Community ohne Owner hinterlassen.
 *
 * BRICHT DER ZWEITE SCHRITT AB (BE-013), wird der erste zurückgenommen: das
 * Ziel bekommt seine vorige Rolle wieder, die Antwort ist ein Fehler (502
 * `transfer_incomplete`). Vorher blieben still zwei Owner stehen, und die
 * Oberfläche meldete einen Fehler, der nicht sagte, dass die Hälfte geschehen
 * war. Scheitert auch das Zurücknehmen, steht eine zählbare Zeile im Log
 * (`site.ownership_transfer_incomplete`) — zwei Owner, niemand ausgesperrt,
 * und der Betreiber sieht es.
 *
 * Unter der Team-Sperre der Community (`withControlLock`, scope `team`): die
 * Mitgliederliste wird darin gelesen, damit eine gleichzeitige Rollen-Änderung
 * oder Übergabe nicht vom selben alten Stand ausgeht.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  memberId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  return await withControlLock(event, { scope: 'team', subject: body.communityId }, async () => {
    const context = await requireCommunityTeamContext(event, body, 'community.transfer')

    const target = context.members.find(row => row.$id === body.memberId)
    if (!target) {
      throw createError({ status: 404, statusText: 'Member not found' })
    }

    throwOnDenied(
      decideTransfer({
        actorUserId: context.identity.userId,
        actorRole: context.actorRole,
        target: memberFacts(target),
      }),
      { communityId: body.communityId, actor: context.identity.userId, target: target.$id },
    )

    const admin = createAdminClient(event)
    await admin.tablesDB.updateRow<CommunityMemberRow>({
      databaseId: context.databaseId,
      tableId: COMMUNITY_MEMBERS_TABLE,
      rowId: target.$id,
      data: { role: 'owner' },
    }).catch((error) => { throw toH3Error(error, 'Could not transfer ownership') })

    try {
      await admin.tablesDB.updateRow<CommunityMemberRow>({
        databaseId: context.databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        rowId: context.actor.$id,
        data: { role: 'admin' },
      })
    }
    catch (demoteError) {
      // Den ersten Schritt zurücknehmen: das Ziel bekommt seine vorige Rolle.
      const rolledBack = await admin.tablesDB.updateRow<CommunityMemberRow>({
        databaseId: context.databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        rowId: target.$id,
        data: { role: target.role },
      }).then(() => true, (rollbackError: unknown) => {
        logEvent('error', 'site.ownership_transfer_incomplete', {
          communityId: body.communityId,
          memberId: target.$id,
          previousRole: target.role,
          actor: context.identity.userId,
          demoteMessage: demoteError instanceof Error ? demoteError.message : String(demoteError),
          rollbackMessage: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
        return false
      })
      if (rolledBack) {
        logEvent('warn', 'site.ownership_transfer_rolled_back', {
          communityId: body.communityId,
          memberId: target.$id,
          actor: context.identity.userId,
          message: demoteError instanceof Error ? demoteError.message : String(demoteError),
        })
      }
      // 502 und ein fachlicher Grund: der zentrale Handler ersetzt die
      // Meldung jedes 5xx, `reason` reist trotzdem mit.
      throw createError({ status: 502, statusText: 'Ownership transfer incomplete', data: { code: 'transfer_incomplete' } })
    }

    logEvent('warn', 'site.ownership_transferred', {
      communityId: body.communityId,
      from: context.identity.userId,
      to: target.runtimeUserId,
      memberId: target.$id,
    })

    return { ok: true, ownerMemberId: target.$id, previousOwnerRole: 'admin' as const }
  })
})
