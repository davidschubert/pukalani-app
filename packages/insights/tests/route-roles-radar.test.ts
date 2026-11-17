import { insightsDb } from '../server/utils/insightsStore'
import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'

/**
 * DER THEMENRADAR HINTER SEINEM ROLLEN-TOR (OPS-009, mit LL1 a 2026-11-17).
 *
 * `insights.manage` ist ein Instanz-Recht (`requirePermission`, globale
 * Labels): nur der Betreiber kommt durch, keine Community-Rolle. Geprüft an
 * den ECHTEN Routen — der Knopf-Start nimmt die Lauf-Sperre erst NACH dem Tor
 * (die Datentür ist hier der Admin-Client hinter `insightsDb`), die Übersicht
 * liest erst danach. Was hinter dem Tor passiert, prüft
 * `insightsRadarRunRoute.test.ts`.
 */

const INSTANCE_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

const runtimeConfig = () => ({ insightsYoutubeKey: 'test-key', public: { appwriteDatabaseId: 'db' } })

describeRoleGateToDoor('POST /api/insights/radar/run', () => import('../server/api/insights/radar/run.post'), INSTANCE_ONLY, {
  globals: { useRuntimeConfig: runtimeConfig },
})

describeRoleGateToDoor('GET /api/insights/radar', () => import('../server/api/insights/radar/index.get'), INSTANCE_ONLY, {
  globals: { useRuntimeConfig: runtimeConfig, insightsDb },
})
