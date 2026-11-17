import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'

/**
 * ROLLEN-PROBEN FÜR DIE MELDE-WARTESCHLANGE (P27, OPS-009).
 *
 * Beide Routen lesen bzw. schreiben über den Admin-Client (der Melder soll
 * fremde Meldungen nicht sehen) — das Rollen-Tor `reports.moderate` ist also
 * die Schranke vor der Tabelle. Echte Handler, echte Core-Wachen; die
 * Erledigung läuft über den echten Vertrag `resolveReportsForTarget`, dessen
 * erster Zugriff der Admin-Client ist (im Prüfstand: die Datentür).
 *
 * `reports.moderate` (abgelesen aus `core/shared/communityAuthz.ts`, nicht
 * berechnet): Moderator, Admin, Owner und der Betreiber im Not-Zugang.
 * Redakteur und Mitglied nicht.
 */

const MODERATE_REPORTS = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
} as const

/** Laufzeit-Konfiguration (Technik): die Datenbank-Id für den Admin-Client. */
const RUNTIME = {
  useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'db' } }),
}

describeRoleGateToDoor(
  'GET /api/reports',
  () => import('../server/api/reports/index.get'),
  MODERATE_REPORTS,
  { query: { status: 'open' } },
)

describeRoleGateToDoor(
  'POST /api/reports/resolve',
  () => import('../server/api/reports/resolve.post'),
  MODERATE_REPORTS,
  { body: { targetType: 'comment', targetId: 'cm-1', resolution: 'hidden' }, globals: RUNTIME },
)
