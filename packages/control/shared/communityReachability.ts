import { communityIsOffline, resolveCommunitySuspension } from '../../core/shared/communitySuspension'

/**
 * PURE (unit-getestet): WARUM ist diese Community nicht erreichbar — oder ist
 * sie es? (SE1 d, die Regel hinter `createUnreachableCommunitiesResolver`).
 *
 *  - `status !== 'active'` ⇒ `'disabled'`. Dieselbe Lesart wie
 *    `mapTenantRowToContext` (server/utils/tenantsResolver.ts): alles außer
 *    genau `active` ist aus — auch ein leerer oder fremder Wert. Der Host
 *    antwortet dort 404.
 *  - Missbrauchs-Sperre (`communityIsOffline`) ⇒ `'abuse'`: vollständig offline,
 *    der Tenant-Resolver liefert ebenfalls `null`.
 *  - Zahlungs-Sperre (`billing`) und keine Sperre ⇒ `null`: der Host lebt
 *    (bei `billing` nur-lesend), dorthin darf erinnert und verlinkt werden.
 *
 * `suspension` ist eine optionale Spalte (control-034) — `null`/fehlend heißt
 * „keine Sperre" (`resolveCommunitySuspension`).
 */
export type CommunityUnreachableReason = 'disabled' | 'abuse'

export function communityUnreachableReason(row: { status?: string | null, suspension?: string | null }): CommunityUnreachableReason | null {
  if (row.status !== 'active') return 'disabled'
  if (communityIsOffline(resolveCommunitySuspension(row.suspension))) return 'abuse'
  return null
}
