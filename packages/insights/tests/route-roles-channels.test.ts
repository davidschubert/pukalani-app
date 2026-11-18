import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'
import { INSIGHTS_TOPIC_KEYS } from '../shared/insightsPost'
import { INSIGHTS_MANAGE_ONLY, insightsRouteGlobals } from './support/insightsRouteKit'

/**
 * DIE KANAL-LISTE DES THEMENRADARS HINTER IHREM ROLLEN-TOR (OPS-009, BT1 b).
 *
 * Alle sechs Routen hängen an `insights.manage` (Instanz-Recht, globale
 * Labels): nur der Betreiber, keine Community-Rolle. Je Route: Gast ⇒ 401,
 * fremdes und entferntes Konto ⇒ 403, jede Community-Rolle ⇒ 403 — jeweils
 * OHNE dass die Datentür (`insightsDb()` → Admin-Client) geöffnet wird; der
 * Betreiber erreicht sie. Die Rümpfe sind gültig, damit der Betreiber nicht
 * schon an der Prüfung scheitert und ein Absturz nicht wie ein Durchlass
 * aussieht. Was hinter dem Tor passiert, prüft `insightsChannel.test.ts`.
 */

const CHANNEL_ID = 'UC' + 'a'.repeat(22)
const TOPIC = INSIGHTS_TOPIC_KEYS[0]

describeRoleGateToDoor('GET /api/insights/channels', () => import('../server/api/insights/channels/index.get'), INSIGHTS_MANAGE_ONLY, {
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/channels', () => import('../server/api/insights/channels/index.post'), INSIGHTS_MANAGE_ONLY, {
  body: { channelId: CHANNEL_ID, topic: TOPIC },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('PATCH /api/insights/channels/[channelId]', () => import('../server/api/insights/channels/[channelId].patch'), INSIGHTS_MANAGE_ONLY, {
  params: { channelId: CHANNEL_ID },
  body: { active: false },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('DELETE /api/insights/channels/[channelId]', () => import('../server/api/insights/channels/[channelId].delete'), INSIGHTS_MANAGE_ONLY, {
  params: { channelId: CHANNEL_ID },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/channels/resolve', () => import('../server/api/insights/channels/resolve.post'), INSIGHTS_MANAGE_ONLY, {
  body: { input: CHANNEL_ID },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/channels/seed', () => import('../server/api/insights/channels/seed.post'), INSIGHTS_MANAGE_ONLY, {
  globals: insightsRouteGlobals(),
})
