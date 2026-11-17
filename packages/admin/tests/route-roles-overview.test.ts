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
 *    protokollierten Not-Zugang. Auch die Instanz-Rolle `moderator` kommt über
 *    denselben Not-Zugang durch (ihr Instanz-Label trägt `dashboard.access`,
 *    `communityAccess.ts`). Ein Konto ohne Rolle und ohne Label nicht.
 *  - Einzel-Instanz: nur die Instanz-Labels — Betreiber und Instanz-Moderator.
 *
 * WELCHE Zahlen jemand sieht, entscheidet hinter der Wache die Kachel
 * (`resolveDashboardStats`) — das prüfen die Tests der Kacheln, nicht dieser.
 */

const DASHBOARD: AdminExpectation = {
  pool: {
    allow: ['owner', 'admin', 'moderator', 'editor', 'member', 'operator', 'instanzModerator'],
    deny: ['konto'],
  },
  silo: {
    allow: ['instanzModerator', 'operator'],
    deny: ['konto'],
  },
}

describeAdminRoute('GET /api/admin/stats', () => import('../server/api/admin/stats.get'), DASHBOARD, {
  globals: { getEffectiveProducts: throughDoor },
})

describeAdminRoute('GET /api/admin/analytics', () => import('../server/api/admin/analytics.get'), DASHBOARD)
