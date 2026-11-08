import { callControlPlane } from '../../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../../utils/communityTeamGate'

/**
 * Besitz an dieses Mitglied übertragen (Davids Entscheidung 3: JA).
 *
 * Autorisiert über `community.transfer` — die OWNER-Capability, nicht `team.manage`.
 * Deshalb kann ein Admin die Verwaltung führen, aber keinen Besitz verschieben.
 * Danach ist der Übertragende Admin.
 *
 * FRISCHE ANMELDUNG (RA2, 2026-11-08 — `requireRecentAuth`, wie Konto löschen):
 * die Übergabe lässt sich vom Übertragenden NICHT zurückholen — danach ist er
 * Admin, und nur der NEUE Owner kann den Besitz zurückgeben. Mit Besitz
 * wandern Abrechnung, Stilllegen und die nächste Übergabe. Ein gestohlenes
 * oder liegengebliebenes Cookie dürfte die Community sonst an ein beliebiges
 * Mitglied verschenken (auch an ein eigenes Zweitkonto, das vorher beitrat).
 * Die Prüfung steht NACH dem Rollen-Gate (ein Nicht-Owner bekommt sein 403,
 * statt sich erst neu anzumelden und DANN abzuprallen) und VOR der
 * Service-Naht — eine Ablehnung hat im Control Plane nichts angefasst.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'community.transfer')
  await requireRecentAuth(event)
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }

  return await callControlPlane<{ ok: boolean, ownerMemberId: string }>(
    event,
    '/api/control/community/members/transfer',
    { jwt, communityId, memberId },
  )
})
