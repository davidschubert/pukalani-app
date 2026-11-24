import type { CommunityTeamMemberFacts } from './communityTeam'
import type { TenantStatus } from './types/tenantRecord'

/**
 * VERWAISTER INHABER-PLATZ (LA2, Davids Entscheidung 2026-11-24).
 *
 * Löscht der EINZIGE Owner einer Community sein Konto, bleibt seine Zeile in
 * `community_members` ohne Personenbezug stehen (`decideMembershipErasure`,
 * Grund `last_owner`): Rolle `owner`, Status `active`, Adresse leer, die
 * `runtimeUserId` zeigt auf ein Konto, das es nicht mehr gibt. „Besitz
 * übertragen" kann danach niemand mehr — das kann nur ein Owner.
 *
 * Der Ausweg ist ein BETREIBER-Weg auf der Platform (account.pukalani.app):
 * der Betreiber gibt den Platz einem bestehenden Konto. Die Platform prüft bei
 * ihrer eigenen Appwrite (`users.get`), dass JEDER aktive Owner wirklich
 * gelöscht ist, und nennt dem Control Plane genau diese Kennungen. Das Control
 * Plane prüft unter der Team-Sperre, dass die Menge der aktiven Owner noch
 * GENAU diese ist — sonst hat sich zwischen Prüfen und Schreiben etwas
 * geändert, und es schreibt nichts.
 *
 * Danach wird die verwaiste Zeile GELÖSCHT (Davids Entscheidung): sie trägt
 * keine Person mehr und schützt nach der Vergabe nichts.
 */

/** Ein aktiver Owner, wie die Status-Abfrage ihn nennt — ohne Adresse. */
export interface CommunityOwnerSlotOwner {
  /** Row-Id der Mitgliedschaft. */
  memberId: string
  /** Appwrite-Konto IM Runtime-Projekt (nach einer Löschung: ein Konto, das es nicht mehr gibt). */
  runtimeUserId: string
  /** Trägt die Zeile noch eine Adresse? Eine entpersonalisierte Zeile nicht. */
  hasEmail: boolean
}

/** Antwort der Naht `members/owner-status`. */
export interface CommunityOwnerStatus {
  communityName: string
  /** Status der Community (`disabled` = stillgelegt, dort wird nichts vergeben). */
  communityStatus: TenantStatus
  owners: CommunityOwnerSlotOwner[]
}

/** Antwort der Naht `members/owner-reassign`. */
export interface CommunityOwnerReassignResult {
  ok: true
  communityName: string
  /** Row-Id der Mitgliedschaft, die jetzt Owner ist. */
  ownerMemberId: string
  /** Wie viele verwaiste Owner-Zeilen gelöscht wurden. */
  removedOrphans: number
}

export type OwnerReassignDenyReason =
  /** Die Community ist stillgelegt — dort gibt es nichts zu verwalten. */
  | 'community_disabled'
  /** Die aktiven Owner sind nicht (mehr) genau die als gelöscht geprüften. */
  | 'owner_changed'
  /** Das neue Konto ist selbst einer der verwaisten Owner. */
  | 'new_owner_is_orphan'

export type OwnerReassignDecision =
  | { ok: true }
  | { ok: false, reason: OwnerReassignDenyReason }

export interface OwnerReassignInput {
  communityStatus: TenantStatus
  /** ALLE Mitgliedschaften der Community, unter der Sperre gelesen. */
  members: readonly CommunityTeamMemberFacts[]
  /** Die Konten, die der Aufrufer als gelöscht geprüft hat. */
  orphanedOwnerIds: readonly string[]
  newRuntimeUserId: string
}

/** Die Kennungen der aktiven Owner — sortiert und ohne Doppelte. */
export function activeOwnerIds(members: readonly CommunityTeamMemberFacts[]): string[] {
  return [...new Set(members
    .filter(member => member.status === 'active' && member.role === 'owner')
    .map(member => member.runtimeUserId))].sort()
}

/**
 * Darf der verwaiste Platz vergeben werden? PURE, unit-getestet.
 *
 * Die Menge der aktiven Owner muss GENAU die genannte sein und darf nicht leer
 * sein. Eine Teilmenge reicht nicht: ein zusätzlicher lebender Owner hieße,
 * dass die Community gar nicht verwaist ist (er kann selbst übertragen).
 */
export function decideOwnerReassign(input: OwnerReassignInput): OwnerReassignDecision {
  if (input.communityStatus === 'disabled') return { ok: false, reason: 'community_disabled' }

  const claimed = [...new Set(input.orphanedOwnerIds)].sort()
  if (claimed.includes(input.newRuntimeUserId)) return { ok: false, reason: 'new_owner_is_orphan' }

  const actual = activeOwnerIds(input.members)
  if (actual.length === 0 || actual.length !== claimed.length || actual.some((id, index) => id !== claimed[index])) {
    return { ok: false, reason: 'owner_changed' }
  }
  return { ok: true }
}
