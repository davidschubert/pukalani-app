import type { MarketCompetitorListResponse } from '../../../../../../shared/types/marketApi'
import { MARKET_COMPETITORS_MAX } from '../../../../../../shared/marketProfile'
import { requireMarketProfile } from '../../../../../utils/marketAccess'
import { listMarketCompetitors } from '../../../../../utils/marketStore'
import { loadMarketBrandChecks } from '../../../../../utils/marketBrandCheck'
import { toMarketCompetitor } from '../../../../../utils/marketViews'

/**
 * DIE KANDIDATEN EINES BRANDINGS (MV1 M2).
 *
 * OHNE Freischaltungs-Prüfung: Wettbewerber einzutragen, während man an
 * Kapitel B arbeitet, ist eine sinnvolle Reihenfolge — gesperrt ist der LAUF
 * (Begründung im Kopf von `marketAccess.ts`).
 *
 * SEIT MV1 M3 trägt jeder Website-Kandidat den BESTEHENDEN Brand-Check-Score
 * (§7.3), falls für seine Adresse einer vorliegt. Gelesen, nie gerechnet — und
 * schon hier, nicht erst im Bericht: die Karte zeigt ihn, sobald es ihn gibt.
 */
export default defineEventHandler(async (event): Promise<MarketCompetitorListResponse> => {
  const { profileId } = await requireMarketProfile(event)
  const rows = await listMarketCompetitors(event, profileId)
  const checks = await loadMarketBrandChecks(event, rows)
  return {
    competitors: rows.map(row => toMarketCompetitor(row, checks.get(row.$id) ?? null)),
    max: MARKET_COMPETITORS_MAX,
  }
})
