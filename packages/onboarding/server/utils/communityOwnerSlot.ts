import type { H3Event } from 'h3'
import type { CommunityOwnerStatus } from '../../../control/shared/communityOwnerSlot'
import type { CommunityOwnerSlotView } from '../../shared/communityOwnerSlot'
import { softFailStatus } from '../../../core/server/utils/softFail'
import { callControlPlane } from './controlPlane'

/**
 * VERWAISTER INHABER-PLATZ, PLATFORM-SEITE (LA2, 2026-11-24).
 *
 * Das Control Plane kennt die Mitgliedschaften, aber nicht die Konten — für
 * die Runtime (Projekt `account`) hat es keinen Schlüssel. Ob ein Owner noch
 * lebt, prüft deshalb DIESE Seite mit ihrem Admin-Client (`users.get`).
 *
 * Eine Störung ist KEIN „gelöscht": nur ein 404 des Kontos zählt als
 * gelöscht, jede andere Antwort endet in 503 — der Betreiber soll nie einen
 * Platz vergeben, weil Appwrite gerade nicht antwortete.
 */

export const OWNER_STATUS_PATH = '/api/control/community/members/owner-status'
export const OWNER_REASSIGN_PATH = '/api/control/community/members/owner-reassign'

/** Das Runtime-Projekt dieser App — das eine, das die Naht bedient. */
export function runtimeProjectOf(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteProjectId
}

/**
 * Die Owner der Community, je Konto mit „gelöscht?". `runtimeUserIds` bleibt
 * auf dem Server (die Vergabe braucht sie, die Seite nicht).
 */
export async function readOwnerSlot(
  event: H3Event,
  communityId: string,
): Promise<{ view: CommunityOwnerSlotView, deletedOwnerIds: string[] }> {
  const status = await callControlPlane<CommunityOwnerStatus>(event, OWNER_STATUS_PATH, {
    runtimeProjectId: runtimeProjectOf(event),
    communityId,
  })

  const admin = createAdminClient(event)
  const owners: CommunityOwnerSlotView['owners'] = []
  const deletedOwnerIds: string[] = []
  for (const owner of status.owners) {
    let deleted: boolean
    try {
      await admin.users.get({ userId: owner.runtimeUserId })
      deleted = false
    }
    catch (error) {
      if (softFailStatus(error) !== 404) {
        logEvent('error', 'onboarding.owner_slot_check_failed', { communityId, status: softFailStatus(error) })
        throw createError({ status: 503, statusText: 'Could not check the owner accounts', data: { code: 'owner_check_unavailable' } })
      }
      deleted = true
      deletedOwnerIds.push(owner.runtimeUserId)
    }
    owners.push({ memberId: owner.memberId, deleted, hasEmail: owner.hasEmail })
  }

  return {
    view: {
      communityId,
      communityName: status.communityName,
      disabled: status.communityStatus === 'disabled',
      owners,
      orphaned: owners.length > 0 && owners.every(owner => owner.deleted),
    },
    deletedOwnerIds,
  }
}
