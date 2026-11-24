import { Query } from 'node-appwrite'
import { z } from 'zod'
import type { CommunityOwnerReassignResult } from '../../../../../control/shared/communityOwnerSlot'
import type { CommunityOwnerReassignResponse } from '../../../../shared/communityOwnerSlot'
import { callControlPlane } from '../../../utils/controlPlane'
import { OWNER_REASSIGN_PATH, readOwnerSlot, runtimeProjectOf } from '../../../utils/communityOwnerSlot'

/**
 * VERWAISTEN INHABER-PLATZ VERGEBEN (LA2, Davids Entscheidung 2026-11-24).
 *
 * Löscht der einzige Owner sein Konto, bleibt sein Platz ohne Person stehen,
 * und „Besitz übertragen" kann niemand mehr. Hier gibt ein BETREIBER den Platz
 * einem bestehenden Konto, das er über die Adresse nennt.
 *
 * Ablauf: Betreiber (`sites.manage`) mit frischer Anmeldung → Konto zur
 * Adresse suchen (404 `account_not_found`) → Owner-Stand im Control Plane
 * lesen und JEDES Owner-Konto hier prüfen (`readOwnerSlot`: 404 = gelöscht,
 * jede andere Antwort 503) → lebt noch einer, 409 `owner_present` → das
 * Control Plane vergibt unter der Team-Sperre und löscht die verwaisten
 * Zeilen (es prüft dort noch einmal, dass die Owner-Menge dieselbe ist) →
 * Eintrag im Betreiber-Protokoll.
 *
 * Das Protokoll ist NICHT strikt: es werden keine Personendaten
 * herausgegeben. Ein Ausfall steht als `audit.write_failed` im Log.
 *
 * Auf einem Mandanten-Host 404 (N7), wie die Lese-Route daneben.
 */
const bodySchema = z.object({
  communityId: z.string().trim().min(1).max(36),
  email: z.email().max(320),
}).strict()

export default defineEventHandler(async (event): Promise<CommunityOwnerReassignResponse> => {
  if (useTenant(event)) throw createError({ status: 404, statusText: 'Not found' })
  const operator = requirePermission(event, 'sites.manage')
  await requireRecentAuth(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const email = body.email.trim().toLowerCase()

  // Das neue Konto. Die Adresse wird gegengeprüft (ohne Groß/klein), damit
  // nie ein Treffer einer ungenauen Abfrage den Platz bekommt.
  const admin = createAdminClient(event)
  const found = await admin.users.list({ queries: [Query.equal('email', email), Query.limit(1)] })
    .catch((error) => { throw toH3Error(error, 'Could not look up the account') })
  const account = found.users.find(user => user.email.toLowerCase() === email)
  if (!account) {
    throw createError({ status: 404, statusText: 'Account not found', data: { code: 'account_not_found' } })
  }
  // Ein GESPERRTES Konto kann sich nicht anmelden — als Inhaber wäre die
  // Community wieder verwaist, nur unsichtbar.
  if (account.status === false) {
    throw createError({ status: 409, statusText: 'Account is blocked', data: { code: 'account_blocked' } })
  }

  const { view, deletedOwnerIds } = await readOwnerSlot(event, body.communityId)
  if (view.disabled) {
    throw createError({ status: 409, statusText: 'Community is disabled', data: { code: 'community_disabled' } })
  }
  if (!view.orphaned) {
    throw createError({ status: 409, statusText: 'The community still has an owner', data: { code: 'owner_present' } })
  }

  const result = await callControlPlane<CommunityOwnerReassignResult>(event, OWNER_REASSIGN_PATH, {
    runtimeProjectId: runtimeProjectOf(event),
    communityId: body.communityId,
    orphanedOwnerIds: deletedOwnerIds,
    newRuntimeUserId: account.$id,
    newEmail: email,
  })

  await writeAuditLog(event, {
    actorId: operator.$id,
    actorName: operator.name,
    action: 'community.owner_reassigned',
    targetType: 'community',
    targetId: body.communityId,
    targetName: result.communityName,
    metadata: { newOwnerId: account.$id, removedOrphans: result.removedOrphans },
  })

  return { ok: true, communityName: result.communityName }
})
