import { ID } from 'node-appwrite'
import { z } from 'zod'
import { decideOwnerReassign, type CommunityOwnerReassignResult } from '../../../../../shared/communityOwnerSlot'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../../shared/types/communityMember'
import { listCommunityMembers, memberFacts } from '../../../../utils/communityTeam'
import { communityDisplayName, loadPoolCommunity } from '../../../../utils/communityOwnerSlot'
import { withControlLock } from '../../../../utils/controlLock'

/**
 * VERWAISTEN INHABER-PLATZ VERGEBEN (LA2, Davids Entscheidung 2026-11-24).
 *
 * Der Betreiber gibt den Owner-Platz einer Community, deren einziger Owner
 * sein Konto gelöscht hat, einem bestehenden Konto. Die Platform hat VORHER
 * bei ihrer Appwrite geprüft, dass jedes genannte Konto gelöscht ist
 * (`orphanedOwnerIds`) und das neue Konto über seine Adresse gefunden — das
 * Control Plane hat für die Runtime keinen Schlüssel und glaubt ihr diese
 * Prüfung, genau wie der Owner-Zeile beim Anlegen.
 *
 * Gate wie die anderen JWT-freien Routen dieser Naht: Service-Secret, Projekt
 * gegen die EINE bediente Runtime (F33), Community gegen dieses Projekt.
 *
 * UNTER DER TEAM-SPERRE (`withControlLock`, scope `team`, wie Übergabe und
 * Rollen-Änderung): die Mitgliederliste wird darin gelesen, und die Menge der
 * aktiven Owner muss GENAU die genannte sein (`decideOwnerReassign`) — sonst
 * 409 `owner_changed`, nichts geschrieben.
 *
 * REIHENFOLGE wie bei der Übergabe, damit nie ein Zustand ohne Owner entsteht:
 * erst das neue Konto zum Owner (eine vorhandene Zeile wird umgestellt, sonst
 * angelegt), DANN die verwaisten Zeilen löschen (Davids Entscheidung: löschen,
 * nicht stehen lassen). Scheitert das Löschen, wird der erste Schritt
 * zurückgenommen und die Antwort ist 502 `owner_reassign_incomplete`; scheitert
 * auch das, steht eine zählbare Zeile im Log
 * (`site.owner_reassign_incomplete`).
 *
 * Das Site-Label des neuen Owners setzt die Runtime beim nächsten Besuch selbst
 * (`06.community-label.ts`); die Rolle wirkt nach dem Rollen-Cache (30 s).
 */
const bodySchema = z.object({
  runtimeProjectId: z.string().min(1).max(36),
  communityId: z.string().min(1).max(36),
  orphanedOwnerIds: z.array(z.string().min(1).max(36)).min(1).max(20),
  newRuntimeUserId: z.string().min(1).max(36),
  newEmail: z.email().max(320),
}).strict()

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export default defineEventHandler(async (event): Promise<CommunityOwnerReassignResult> => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const runtimeProjectId = assertOnboardingRuntimeProject(event, body.runtimeProjectId)
  const newEmail = body.newEmail.trim().toLowerCase()

  return await withControlLock(event, { scope: 'team', subject: body.communityId }, async () => {
    const tenant = await loadPoolCommunity(event, body.communityId, runtimeProjectId)
    const members = await listCommunityMembers(event, body.communityId, runtimeProjectId)

    const decision = decideOwnerReassign({
      communityStatus: tenant.status,
      members: members.map(memberFacts),
      orphanedOwnerIds: body.orphanedOwnerIds,
      newRuntimeUserId: body.newRuntimeUserId,
    })
    if (!decision.ok) {
      logEvent('warn', 'site.owner_reassign_denied', { communityId: body.communityId, reason: decision.reason })
      throw createError({ status: 409, statusText: 'Owner slot cannot be reassigned', data: { code: decision.reason } })
    }

    const orphans = members.filter(member =>
      member.status === 'active' && member.role === 'owner' && body.orphanedOwnerIds.includes(member.runtimeUserId))
    const existing = members.find(member => member.runtimeUserId === body.newRuntimeUserId) ?? null

    const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
    const admin = createAdminClient(event)

    // ── Schritt 1: das neue Konto wird Owner ────────────────────────────────
    let ownerMemberId: string
    if (existing) {
      await admin.tablesDB.updateRow<CommunityMemberRow>({
        databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        rowId: existing.$id,
        data: { role: 'owner', status: 'active', email: newEmail, removedAt: null },
      }).catch((error) => { throw toH3Error(error, 'Could not reassign owner') })
      ownerMemberId = existing.$id
    }
    else {
      const created = await admin.tablesDB.createRow<CommunityMemberRow>({
        databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        rowId: ID.unique(),
        data: {
          communityId: body.communityId,
          runtimeProjectId,
          runtimeUserId: body.newRuntimeUserId,
          role: 'owner',
          status: 'active',
          email: newEmail,
        },
      }).catch((error) => { throw toH3Error(error, 'Could not reassign owner') })
      ownerMemberId = created.$id
    }

    // ── Schritt 2: die verwaisten Zeilen löschen ────────────────────────────
    let removedOrphans = 0
    try {
      for (const orphan of orphans) {
        await admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: orphan.$id })
        removedOrphans++
      }
    }
    catch (deleteError) {
      // Den ersten Schritt zurücknehmen: die vorige Zeile bekommt ihren Stand
      // zurück, eine neu angelegte verschwindet wieder.
      const rollback = existing
        ? admin.tablesDB.updateRow<CommunityMemberRow>({
            databaseId,
            tableId: COMMUNITY_MEMBERS_TABLE,
            rowId: existing.$id,
            data: { role: existing.role, status: existing.status, email: existing.email, removedAt: existing.removedAt ?? null },
          })
        : admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: ownerMemberId })
      const rolledBack = await rollback.then(() => true, (rollbackError: unknown) => {
        logEvent('error', 'site.owner_reassign_incomplete', {
          communityId: body.communityId,
          memberId: ownerMemberId,
          removedOrphans,
          deleteMessage: message(deleteError),
          rollbackMessage: message(rollbackError),
        })
        return false
      })
      if (rolledBack) {
        logEvent('warn', 'site.owner_reassign_rolled_back', {
          communityId: body.communityId,
          memberId: ownerMemberId,
          removedOrphans,
          message: message(deleteError),
        })
      }
      throw createError({ status: 502, statusText: 'Owner reassign incomplete', data: { code: 'owner_reassign_incomplete' } })
    }

    logEvent('warn', 'site.owner_reassigned', {
      communityId: body.communityId,
      to: body.newRuntimeUserId,
      memberId: ownerMemberId,
      reusedRow: existing !== null,
      removedOrphans,
    })

    return { ok: true, communityName: communityDisplayName(tenant), ownerMemberId, removedOrphans }
  })
})
