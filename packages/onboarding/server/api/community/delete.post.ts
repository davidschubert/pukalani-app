import { callControlPlane } from '../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../utils/communityTeamGate'
import type { CommunityDeleteResponse } from '../../../shared/types/communityDelete'

/**
 * DIESE COMMUNITY LÖSCHEN (C16, 2026-07-31) — Owner-Route, gleiche Kette wie
 * Übergabe und Branding: `community.delete` prüfen, JWT prägen, Service-Naht
 * zum Control Plane (`communities` gehört dorthin, die Platform-App hat nur
 * einen Read-only-Key).
 *
 * DER BEWUSSTE SCHNITT — **Deaktivieren + Zugänge entziehen, Daten bleiben.**
 * Kein Hard-Delete: die Begründung steht bei der puren Regel
 * (`decideCommunityDeletion` in packages/control/shared/communityTeam.ts), die
 * Wirkung in der Gegenroute
 * (packages/control/server/api/control/community/delete.post.ts).
 *
 * ZWEI SCHRITTE, ZWEI PROJEKTE — genau wie „Zugang entziehen" (A5): das
 * Control Plane nimmt Status und Rollen (seine Tabellen), DIESE Route nimmt das
 * LESE-PUBLIKUM. Community-Labels leben im Pool-Projekt, und nur die Runtime hat
 * dafür einen Schlüssel. Ohne den zweiten Schritt wäre die Community zwar
 * offline, ihre `read(label:<communityId>)`-Zeilen aber weiterhin für jedes
 * ehemalige Mitglied lesbar — etwa über eine andere Community desselben Pools.
 *
 * DER ENTZUG WIRD GEZÄHLT (SEC-024, seit 2026-11-13): die Community IST
 * stillgelegt, das ist die Wahrheit, und daran ändert ein gescheiterter
 * Label-Entzug nichts — die Antwort bleibt ein Erfolg. Sie nennt aber
 * `labels: { total, revoked, failed }`, und die Oberfläche zeigt bei
 * `failed > 0` einen Hinweis statt reinem Erfolg. Jeder Entzug ist
 * nachgeprüft (revokeCommunityLabel); was hängen bleibt, holt der stündliche
 * Abgleich nach (onboarding/server/utils/labelReconcile.ts) — die
 * Label-Middleware kann es hier nicht mehr: der Host antwortet 404.
 *
 * WARUM POST UND NICHT DELETE: die Route löscht nichts. `POST …/delete` sagt
 * „führe den Vorgang Löschen aus" — DELETE hätte behauptet, hier verschwinde
 * eine Ressource.
 *
 * FRISCHE ANMELDUNG (RA2, 2026-11-08 — `requireRecentAuth`, wie Konto löschen):
 * die Daten bleiben zwar, aber der OWNER kann das Stilllegen nicht
 * zurücknehmen — der Host antwortet 404, alle Mitgliedschaften sind
 * 'removed', die Labels eingezogen; zurück geht es nur über den Betreiber, und
 * auch dann muss jedes Mitglied neu eingeladen werden. Für die Community ist es
 * also das Ende. Die Prüfung steht NACH dem Rollen-Gate (Nicht-Owner: 403
 * statt Umweg über den Login) und VOR der Service-Naht — eine Ablehnung hat
 * nichts stillgelegt.
 */
export default defineEventHandler(async (event): Promise<CommunityDeleteResponse> => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'community.delete')
  await requireRecentAuth(event)

  const result = await callControlPlane<{
    ok: boolean
    communityId: string
    status: 'disabled'
    runtimeUserIds: string[]
    members: { total: number, removed: number, failed: number, complete: boolean }
  }>(
    event,
    '/api/control/community/delete',
    { jwt, communityId },
  )

  const labels = { total: result.runtimeUserIds.length, revoked: 0, failed: 0 }
  for (const runtimeUserId of result.runtimeUserIds) {
    // Erst merken, dann einziehen — der Rollen-Resolver cacht 30 s, und ohne
    // die Notiz vergäbe die Label-Middleware das Publikum beim nächsten
    // Request sofort wieder (siehe communityJoin.ts).
    rememberCommunityAccessRevoked(communityId, runtimeUserId)
    const revoke = await revokeCommunityLabel(event, communityId, runtimeUserId)
    if (revoke.revoked) {
      labels.revoked++
      continue
    }
    // Weiter mit den nächsten: ein Fehlschlag hält die anderen Entzüge nicht auf.
    labels.failed++
    logEvent('error', 'community.delete_label_failed', { communityId, userId: runtimeUserId, reason: revoke.reason })
  }

  return {
    ok: result.ok,
    communityId: result.communityId,
    status: result.status,
    members: result.members,
    labels,
  }
})
