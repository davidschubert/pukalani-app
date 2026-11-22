import type { H3Event } from 'h3'

/**
 * DIE ÜBERSICHT EINER POOL-COMMUNITY SIEHT VON AUSSEN NUR DER BETREIBER
 * (BT1 e, Davids Entscheidung 2026-11-21: „Nur ich als Betreiber").
 *
 * Kennzahlen und Aktivitätskurve hängen am Gate der Dashboard-Seite
 * (`dashboard.access`). Den trägt auch das Instanz-Label `moderator`
 * (`core/shared/authz.ts`) — über den protokollierten Not-Zugang
 * (`via: 'operator'`) käme ein Mitarbeiter mit diesem Label in die Zahlen
 * JEDER Community. Das ist hier zu: im Not-Zugang braucht es das
 * Betreiber-Label `admin`.
 *
 * Unberührt bleiben: alle Rollen der Community selbst (`via: 'role'` /
 * `'trust'`) und die Einzel-Instanz (`via: 'single-tenant'`), wo das
 * Instanz-Label die Mannschaft der eigenen Site ist. Wächter:
 * `tests/route-roles-overview.test.ts`.
 */
export async function requireOverviewAccess(event: H3Event) {
  const gate = await requireCommunityPermission(event, 'dashboard.access')
  if (gate.via === 'operator' && !(gate.user.labels ?? []).includes('admin')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  return gate
}
