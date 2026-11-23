import { hasCapability } from '../../core/shared/authz'
import { throughDoor, type AdminExpectation, describeAdminRoute } from './support/adminRouteHarness'

/**
 * DIE ÜBERSICHT DES DASHBOARDS: Kennzahlen und Aktivitätskurve (OPS-009).
 *
 * Echter Handler, echte Wache `requireCommunityPermission(event,
 * 'dashboard.access')` aus dem Core (Prüfstand `support/adminRouteHarness.ts`).
 * Ausgeschrieben, nicht aus der Rechte-Matrix berechnet:
 *
 *  - Pool: JEDE Rolle der Community erreicht die Startseite des Dashboards
 *    (Owner, Admin, Moderator, Editor, Mitglied), dazu der Betreiber über den
 *    protokollierten Not-Zugang. Die Instanz-Rolle `moderator` NICHT (BT1 e,
 *    Davids Entscheidung 2026-11-21: „Nur ich als Betreiber") — ihr
 *    Instanz-Label trägt zwar `dashboard.access`, aber `requireOverviewAccess`
 *    verlangt im Not-Zugang das Betreiber-Label. Ein Konto ohne Rolle und
 *    ohne Label auch nicht.
 *  - Einzel-Instanz: nur die Instanz-Labels — Betreiber und Instanz-Moderator.
 *
 * WELCHE Zahlen jemand sieht, entscheidet hinter der Wache die Kachel
 * (`resolveDashboardStats`) — das prüfen die Tests der Kacheln, nicht dieser.
 */

const DASHBOARD: AdminExpectation = {
  pool: {
    allow: ['owner', 'admin', 'moderator', 'editor', 'member', 'operator'],
    deny: ['konto', 'instanzModerator'],
  },
  silo: {
    allow: ['instanzModerator', 'operator'],
    deny: ['konto'],
  },
}

const BEHIND_GATE = { poolDenyBehindGate: ['instanzModerator'] } as const

describeAdminRoute('GET /api/admin/stats', () => import('../server/api/admin/stats.get'), DASHBOARD, {
  globals: { getEffectiveProducts: throughDoor },
}, BEHIND_GATE)

describeAdminRoute('GET /api/admin/analytics', () => import('../server/api/admin/analytics.get'), DASHBOARD, {}, BEHIND_GATE)

// V2 (2026-11-23): die Suche der Befehlspalette hängt am selben Gate der
// Seite — im Pool-Not-Zugang ebenfalls nur der Betreiber.
describeAdminRoute('GET /api/admin/search', () => import('../server/api/admin/search.get'), DASHBOARD, {
  query: { q: 'stein' },
  globals: { hasCapability },
}, BEHIND_GATE)
