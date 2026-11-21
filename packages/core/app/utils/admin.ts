import type { Capability } from '../../shared/types/authz'
import { ROLES, capabilitiesFor, hasCapability } from '../../shared/authz'

/** Im Dashboard zuweisbare Rollen (UI-Quelle, Matrix bleibt in shared/authz). */
export const ASSIGNABLE_ROLES = ROLES

/**
 * Client-seitiger Capability-Check (UX-Schicht — die Autorität liegt in
 * requirePermission() im Server). Nutzt dieselbe Matrix (shared/authz).
 */
export function userHasCapability(
  user: { labels?: string[] } | null | undefined,
  capability: Capability,
): boolean {
  return hasCapability(user?.labels, capability)
}

/**
 * Wie userHasCapability, aber für einen Capability-NAMEN als String (z.B. aus
 * Route-Meta) — unbekannte Namen ergeben false (deny-by-default).
 */
export function userHasCapabilityName(
  user: { labels?: string[] } | null | undefined,
  name: string,
): boolean {
  return capabilitiesFor(user?.labels).has(name as Capability)
}
