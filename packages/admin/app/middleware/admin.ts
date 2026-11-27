import type { Capability } from '../../../core/shared/types/authz'
import type { DashboardScope } from '../../../core/shared/dashboardNav'
import { safeRedirectTarget } from '../../../core/shared/redirectTarget'

/**
 * Route-Middleware für Dashboard-Pages (UX-Schicht — die Autorität sind die
 * requirePermission()/requireCommunityPermission()-Gates in den Server Routes).
 *
 * ZWEI Wege hinein (N1, analog decideCommunityAccess auf dem Server):
 *  1. Operator-Label (admin/moderator) mit dashboard.access — unverändert,
 *     inkl. Break-Glass auf Kunden-Sites.
 *  2. SITE-Rolle mit dashboard.access (useCommunityRole, SSR-gespiegelt): laut
 *     Rechte-Matrix in shared/communityAuthz.ts tragen ALLE fünf Site-Rollen
 *     (owner/admin/moderator/editor/viewer) dashboard.access — die Matrix ist
 *     die Quelle, hier wird nichts neu erfunden. Was jemand DRIN sieht,
 *     filtern Nav (dashboard-Layout) und `requiredCapability` je Page.
 *
 * Eine Page kann via `definePageMeta({ requiredCapability })` eine zusätzliche
 * Capability verlangen (z.B. 'users.manage') — auch die erfüllt entweder ein
 * Label ODER die Site-Rolle. Siehe docs/referenz/RBAC-CONCEPT.md.
 *
 * DER ORT ENTSCHEIDET MIT (Davids Entscheidung 2026-08-18): Instanz-Seiten
 * sind nur dort erreichbar, wo ihr Menü-Eintrag stehen darf. Den 404-Wächter
 * dafür stellt `dashboard-scope.global.ts` — GLOBAL, weil er VOR der
 * `auth`-Middleware laufen muss (sonst verriete der Login-Redirect einem
 * Anonymen die Existenz der Seite). Hier bleibt nur die Rechte-Hälfte: bei
 * `dashboardScope: 'operator'` zählt als Rechte-Quelle NUR das globale
 * Operator-Label, nie die Community-Rolle.
 */
export default defineNuxtRouteMiddleware((to) => {
  const scope = to.meta.dashboardScope

  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    // Mit Rückweg wie die `auth`-Middleware (PK1-EIN, Befund 3).
    const target = safeRedirectTarget(to.fullPath)
    return navigateTo({
      path: useLocalePath()('/login'),
      ...(target ? { query: { redirect: target } } : {}),
    })
  }

  const { capabilities: siteCaps } = useCommunityRole()
  /**
   * ZWEITE Härtung, spiegelt `moduleAllowedFor` (core/shared/dashboardNav.ts,
   * Begründung dort): für BETREIBER-Seiten zählt NUR das globale
   * Operator-Label, nie die Community-Rolle. Eine Community-Rolle erreicht ein
   * Betreiber-Modul an keinem Ort — sonst genügte im Einzelbetrieb (wo der Ort
   * nichts trennt) eine schwache Site-Capability. Für Seiten ohne
   * `dashboardScope` oder mit anderer Ebene bleibt es bei „Rolle ODER Label".
   */
  const operatorOnly = scope === 'operator'
  const hasSiteCap = (capability: Capability) => !operatorOnly && siteCaps.value.has(capability)
  const can = (capability: Capability) =>
    userHasCapability(auth.user, capability) || hasSiteCap(capability)

  if (!can('dashboard.access')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  const required = to.meta.requiredCapability
  // Unbekannte Namen ergeben in BEIDEN Prüfungen false (deny-by-default).
  if (required && !userHasCapabilityName(auth.user, required) && !hasSiteCap(required as Capability)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})

declare module '#app' {
  interface PageMeta {
    /** Zusätzlich zu dashboard.access erforderliche Capability (RBAC). */
    requiredCapability?: string
    /**
     * Ebene der Seite (E9). Gesetzt ⇒ die Seite antwortet an einem Ort, an dem
     * ihr Menü-Eintrag nicht stehen dürfte, 404 — und `'operator'` schaltet
     * zusätzlich die Site-Rolle als Rechte-Quelle ab.
     */
    dashboardScope?: DashboardScope
  }
}
