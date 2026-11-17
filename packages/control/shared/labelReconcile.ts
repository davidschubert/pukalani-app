import { COMMUNITY_ROLES, communityRoleHasCapability, isCommunityRole, type CommunityRole } from '../../core/shared/communityAuthz'
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

/**
 * Eine Liste OHNE Fortsetzung (SI1 b): die zwei Fragen nach `active`-Zeilen
 * lesen höchstens `limit` Zeilen; `truncated` sagt, dass dahinter mehr lag
 * (der Lauf schreibt dann eine Log-Zeile — nie still abschneiden).
 */
export interface MembershipList {
  rows: RemovedMembership[]
  truncated: boolean
}

export interface LabelReconcileReader {
  /** `status='removed'` dieses Runtime-Projekts, höchstens `limit` Zeilen ab `after`. */
  listRemoved: (runtimeProjectId: string, page: { limit: number, after: string | null }) => Promise<RemovedMembershipPage>
  /**
   * Gibt es für genau dieses Paar eine Zeile MIT Zugang? Zugang heißt seit
   * SI1 b: Zeile `active` UND Community `active` — eine stillgelegte Community
   * gibt niemandem Zugang (ihr Host antwortet 404).
   */
  hasAccess: (runtimeProjectId: string, communityId: string, userId: string) => Promise<boolean>
  /**
   * SI1 b, Lücke 2: `active`-Zeilen dieses Runtime-Projekts in STILLGELEGTEN
   * Communities (`communities.status='disabled'`) — das Stilllegen hat ihre
   * Umstellung auf `removed` nicht geschafft.
   */
  listActiveInDisabled: (runtimeProjectId: string, page: { limit: number }) => Promise<MembershipList>
  /**
   * SI1 b, Lücke 1: `active`-Zeilen dieses Runtime-Projekts mit einer Rolle
   * OHNE Moderations-Label, geändert nach `since` (ISO-Zeit), neueste zuerst.
   */
  listDemoted: (runtimeProjectId: string, page: { limit: number, since: string }) => Promise<MembershipList>
  /** Trägt die Zeile dieses Paars JETZT eine Rolle MIT Moderations-Label (und ist `active`)? */
  moderatesNow: (runtimeProjectId: string, communityId: string, userId: string) => Promise<boolean>
}

/** Nur `active` gibt Zugang — dieselbe Regel wie der Rollen-Resolver
 *  (`communityMembersResolver`); `invited`/`suspended`/`removed` nicht. */
export function membershipGrantsAccess(status: string): boolean {
  return status === 'active'
}

/** Nur eine `active`-Community gibt Zugang — dieselbe Regel wie der
 *  Host-Resolver (`tenantsResolver.ts`: `row.status !== 'active'` ⇒ kein Host). */
export function communityGrantsAccess(status: string | null | undefined): boolean {
  return status === 'active'
}

/**
 * Trägt diese Rolle das Moderations-Label? GENAU die Regel, nach der die
 * Label-Middleware beim Besuch vergibt und einzieht
 * (`core/server/middleware/06.community-label.ts`:
 * `communityRoleHasCapability(role, 'reports.moderate')`) — keine zweite.
 * Ein unbekannter Wert trägt es nicht.
 */
export function roleCarriesModeratorLabel(role: string): boolean {
  return isCommunityRole(role) && communityRoleHasCapability(role, 'reports.moderate')
}

/** Die Rollen OHNE Moderations-Label — der Filter der Frage `listDemoted`. */
export const ROLES_WITHOUT_MODERATOR_LABEL: readonly CommunityRole[] = COMMUNITY_ROLES.filter(role => !roleCarriesModeratorLabel(role))

/**
 * Die Labels, die eine Community am Konto hinterlässt: Zugehörigkeit und
 * Moderations-Team. Kann der Wert kein Label sein (Bindestrich, leer), gibt es
 * nichts zu entziehen — und der Abgleich fasst das Konto nicht an.
 */
export function communityLabelsFor(communityId: string): string[] {
  const moderator = communityModeratorLabel(communityId)
  return moderator ? [communityId, moderator] : []
}
