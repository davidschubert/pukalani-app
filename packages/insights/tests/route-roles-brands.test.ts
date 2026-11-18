import { insightsBrandMissing, insightsStorageError, loadInsightsBrandRow } from '../server/utils/insightsPostsAdmin'
import { insightsDb, isInsightsRowMissing } from '../server/utils/insightsStore'
import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'
import { insightsRouteGlobals } from './support/insightsRouteKit'

/**
 * DAS SPEICHERN EINER MARKEN-SEITE HINTER SEINEM ROLLEN-TOR (OPS-009, mit
 * IN1 c 2026-11-17).
 *
 * `insights.manage` ist ein Instanz-Recht (`requirePermission`, globale
 * Labels): nur der Betreiber kommt durch, keine Community-Rolle. Geprüft an
 * der ECHTEN Route — sie liest die Zeile erst NACH dem Tor (die Datentür ist
 * hier der Admin-Client hinter `insightsDb`). Was hinter dem Tor passiert
 * (Prüfung, Zeichen, „nichts geschrieben"), prüft `insightsBrandGate.test.ts`.
 */

const INSTANCE_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

const runtimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })

describeRoleGateToDoor('PATCH /api/insights/brands/[id]', () => import('../server/api/insights/brands/[id].patch'), INSTANCE_ONLY, {
  params: { id: 'b1' },
  body: { slug: 'roesterei', name: 'Rösterei', state: 'draft' },
  globals: {
    useRuntimeConfig: runtimeConfig,
    insightsDb,
    isInsightsRowMissing,
    insightsBrandMissing,
    insightsStorageError,
    loadInsightsBrandRow,
  },
})

// ── Die lesenden Marken-Routen der Redaktion (BT1 b) ───────────────────────
// Dasselbe Tor, dieselbe Erwartung: auch das LESEN der Redaktions-Liste und
// eines Profils (mit Entwürfen und internen Feldern) ist Betreiber-Sache.

describeRoleGateToDoor('GET /api/insights/brands', () => import('../server/api/insights/brands/index.get'), INSTANCE_ONLY, {
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('GET /api/insights/brands/[id]', () => import('../server/api/insights/brands/[id].get'), INSTANCE_ONLY, {
  params: { id: 'b1' },
  globals: insightsRouteGlobals(),
})
