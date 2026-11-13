import type { H3Event } from 'h3'
import { detectCommunityRemoval, type CommunityRemovalMemory } from '../../shared/communityRemoval'
import { communityAccessMemory } from './communityJoin'
import { resolveFormerMembers } from './communityMembership'
import { resolveCommunityRole } from './communityPermission'

/**
 * „IST DER NUTZER DIESES REQUESTS AUS DER COMMUNITY DIESES HOSTS ENTFERNT?"
 * (SEC-030 Teil 2, 2026-11-13) — die Frage hinter der Sperre in
 * `server/middleware/06.community-removed.ts` und hinter der Kontakt-Route des
 * onboarding-Layers.
 *
 * NUR IM POOL. Silo, Kontroll-Host und Einzelbetrieb: nie — dort ist das
 * PROJEKT die Grenze, eine Mitgliedschaft gibt es nicht (dieselbe Ausnahme wie
 * `joinCommunity` und `06.community-label.ts`).
 *
 * Reihenfolge und Begründung: `detectCommunityRemoval` (shared). Kurz: Notiz
 * „gerade entzogen" ⇒ ja; Notiz „gerade wieder aufgenommen" ⇒ nein; aktive
 * Rolle ⇒ nein (ohne den Resolver „ehemalig" zu fragen); sonst die positive
 * Tatsache einer Zeile `status: 'removed'`. Die Notiz `closed` zählt hier
 * nicht: geschlossene Registrierung heißt „nie drin", nicht „entfernt".
 *
 * WARUM FAIL-SOFT, obwohl es eine Sperre ist: diese Frage läuft bei JEDEM
 * Request eines angemeldeten Nicht-Mitglieds auf jedem Pool-Host — auch auf
 * Seiten. Würde sie bei einer Störung des Control Plane „ja" sagen, landete
 * jedes Konto ohne Rolle (Gäste mit Konto, Leser offener Communities) auf
 * einer Hinweisseite, die behauptet, ein Administrator habe es entfernt — eine
 * falsche Anschuldigung auf Verdacht. Die Grenze für das SCHREIBEN bleibt
 * davon unberührt: die Wachen aus SEC-030 (`requireCommunityParticipant`,
 * `requireCommunityMembership`) und die Datentür sind fail-closed. Und das
 * Lesen hält das Site-Label: das hat eine entfernte Person nicht mehr.
 */
export async function isRemovedFromCommunity(event: H3Event): Promise<boolean> {
  const userId = event.context.user?.$id
  const tenant = event.context.tenant
  if (!userId || tenant?.mode !== 'pool' || !tenant.communityId) return false
  const communityId = tenant.communityId

  return await detectCommunityRemoval({
    memory: (): CommunityRemovalMemory => {
      const remembered = communityAccessMemory(communityId, userId)
      return remembered === 'closed' ? null : remembered
    },
    hasActiveRole: async () => Boolean(await resolveCommunityRole(event)),
    isFormerMember: async () => (await resolveFormerMembers(event, [userId])).has(userId),
  })
}
