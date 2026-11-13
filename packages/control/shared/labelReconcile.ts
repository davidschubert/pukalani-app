import { communityModeratorLabel } from '../../core/shared/communityModeratorLabel'

/**
 * VERTRAG DES LABEL-ABGLEICHS (SEC-024, seit 2026-11-13) zwischen dem Leser
 * (control-Layer, `server/utils/labelReconcileReader.ts`) und der Logik
 * (onboarding-Layer, `server/utils/labelReconcile.ts`).
 *
 * WELCHER WERT IST DAS LABEL? `community_members.communityId` ist
 * `communities.$id` (shared/types/communityMember.ts), und das Lese-Publikum
 * einer Pool-Community ist `Role.label(tenant.communityId)` mit
 * `tenant.communityId = row.$id` (server/utils/tenantsResolver.ts,
 * `mapTenantRowToContext`; Rechte-Bau in
 * core/server/utils/tenantRowPermissions.ts). Beides ist derselbe Wert —
 * NICHT `communities.tenantId` (`t-…`), den Benachrichtigungen und
 * Mail-Links nachschlagen. Festgenagelt in
 * `packages/control/tests/labelReconcileReader.test.ts`.
 */

/** Eine entzogene Mitgliedschaft — nur Kennungen, keine Adresse, kein Name. */
export interface RemovedMembership {
  /** `community_members.$id` — der Cursor des Lesers. */
  rowId: string
  /** = `communities.$id` = das Community-Label. */
  communityId: string
  /** Das Konto IM Runtime-Projekt (Pool). */
  userId: string
}

export interface RemovedMembershipPage {
  rows: RemovedMembership[]
  /** `null` = alles gelesen; sonst geht der nächste Lauf HINTER diesem Wert weiter. */
  nextCursor: string | null
}

export interface LabelReconcileReader {
  /** `status='removed'` dieses Runtime-Projekts, höchstens `limit` Zeilen ab `after`. */
  listRemoved: (runtimeProjectId: string, page: { limit: number, after: string | null }) => Promise<RemovedMembershipPage>
  /** Gibt es für genau dieses Paar eine Zeile MIT Zugang (`active`)? */
  hasAccess: (runtimeProjectId: string, communityId: string, userId: string) => Promise<boolean>
}

/** Nur `active` gibt Zugang — dieselbe Regel wie der Rollen-Resolver
 *  (`communityMembersResolver`); `invited`/`suspended`/`removed` nicht. */
export function membershipGrantsAccess(status: string): boolean {
  return status === 'active'
}

/**
 * Die Labels, die eine Community am Konto hinterlässt: Zugehörigkeit und
 * Moderations-Team. Kann der Wert kein Label sein (Bindestrich, leer), gibt es
 * nichts zu entziehen — und der Abgleich fasst das Konto nicht an.
 */
export function communityLabelsFor(communityId: string): string[] {
  const moderator = communityModeratorLabel(communityId)
  return moderator ? [communityId, moderator] : []
}
