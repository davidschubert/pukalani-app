import type { Capability } from '../../shared/types/authz'
import { ROLES, capabilitiesFor, hasCapability } from '../../shared/authz'

/** Im Dashboard zuweisbare Rollen (UI-Quelle, Matrix bleibt in shared/authz). */
export const ASSIGNABLE_ROLES = ROLES

/**
 * Eigene Domain im Modus `write` (PK1 E1b-2): Betreiber-Labels tragen dort
 * keine Rechte — dieselbe Regel wie `requirePermission` und
 * `decideCommunityAccess` auf dem Server (SSR-Spiegel `useCustomDomainScope`).
 */
function operatorLabelsCount(): boolean {
  return !(tryUseNuxtApp() && useCustomDomainScope().value)
}

/**
 * Client-seitiger Capability-Check (UX-Schicht — die Autorität liegt in
 * requirePermission() im Server). Nutzt dieselbe Matrix (shared/authz).
 */
export function userHasCapability(
  user: { labels?: string[] } | null | undefined,
  capability: Capability,
): boolean {
  return operatorLabelsCount() && hasCapability(user?.labels, capability)
}

/**
 * Wie userHasCapability, aber für einen Capability-NAMEN als String (z.B. aus
 * Route-Meta) — unbekannte Namen ergeben false (deny-by-default).
 */
export function userHasCapabilityName(
  user: { labels?: string[] } | null | undefined,
  name: string,
): boolean {
  return operatorLabelsCount() && capabilitiesFor(user?.labels).has(name as Capability)
}
