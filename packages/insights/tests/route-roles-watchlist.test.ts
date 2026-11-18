import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'
import { INSIGHTS_MANAGE_ONLY, insightsRouteGlobals } from './support/insightsRouteKit'

/**
 * DIE MERKLISTE DES THEMENRADARS HINTER IHREM ROLLEN-TOR (OPS-009, BT1 b).
 *
 * Fünf Routen an `insights.manage` (Instanz-Recht): nur der Betreiber. Je
 * Route Gast ⇒ 401, fremdes/entferntes Konto und jede Community-Rolle ⇒ 403,
 * Datentür zu; der Betreiber erreicht sie. Das Hinzufügen fragt hinter der
 * Tür die Video-Schnittstelle — die Probe endet vorher an der Datentür (erst
 * wird nach einem Doppel gesucht), es gibt keinen Netz-Aufruf. Was hinter dem
 * Tor passiert, prüft `insightsWatchlist.test.ts`.
 */

const VIDEO_ID = 'dQw4w9WgXcQ'

describeRoleGateToDoor('GET /api/insights/watchlist', () => import('../server/api/insights/watchlist/index.get'), INSIGHTS_MANAGE_ONLY, {
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/watchlist', () => import('../server/api/insights/watchlist/index.post'), INSIGHTS_MANAGE_ONLY, {
  body: { input: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('PATCH /api/insights/watchlist/[videoId]', () => import('../server/api/insights/watchlist/[videoId].patch'), INSIGHTS_MANAGE_ONLY, {
  params: { videoId: VIDEO_ID },
  body: { note: 'ansehen' },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('DELETE /api/insights/watchlist/[videoId]', () => import('../server/api/insights/watchlist/[videoId].delete'), INSIGHTS_MANAGE_ONLY, {
  params: { videoId: VIDEO_ID },
  globals: insightsRouteGlobals(),
})

describeRoleGateToDoor('POST /api/insights/watchlist/verdict', () => import('../server/api/insights/watchlist/verdict.post'), INSIGHTS_MANAGE_ONLY, {
  body: { videoId: VIDEO_ID, verdict: 'interesting' },
  globals: insightsRouteGlobals(),
})
