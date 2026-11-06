import { Query } from 'node-appwrite'
import type { MarketCompetitorDeleteResponse } from '../../../../../../shared/types/marketApi'
import { MARKET_COMPETITORS_TABLE, MARKET_PROFILES_TABLE } from '../../../../../../shared/types/market'
import { requireCompetitorIdParam, requireMarketProfile } from '../../../../../utils/marketAccess'
import { isMarketRowMissing, loadMarketCompetitor, marketDb } from '../../../../../utils/marketStore'

/**
 * EINEN KANDIDATEN ENTFERNEN.
 *
 * ── HIER WIRD WIRKLICH GELÖSCHT, ANDERS ALS BEI MITGLIEDERN ───────────────
 * Ein Wettbewerber ist kein Mensch und keine Mitgliedschaft: es hängen keine
 * Inhalte an ihm, keine Urheberschaft, keine Zugriffsrechte. Ein
 * `status: 'removed'` (das Muster aus `community_members`) hätte hier nichts
 * zu schützen und wäre eine Zeile, die den Deckel von fünf blockiert, ohne
 * jemandem zu nützen.
 *
 * ── DIE PROFILE GEHEN MIT ─────────────────────────────────────────────────
 * Reihenfolge: Kinder zuerst (Profile), dann der Kandidat — dieselbe
 * Begründung wie in `removeMarketProfileData`: ein Abbruch soll SICHTBAREN
 * Rest hinterlassen. Ein Kandidat ohne Profile steht in der Liste, ein Profil
 * ohne Kandidaten steht nirgends.
 *
 * Der BERICHT (`market_reports`) bleibt: er ist ein eingefrorener Stand und
 * darf sagen, was am Tag seiner Erstellung im Feld stand. Ihn nachträglich zu
 * beschneiden hiesse, eine Momentaufnahme zu fälschen.
 */
export default defineEventHandler(async (event): Promise<MarketCompetitorDeleteResponse> => {
  const { profileId } = await requireMarketProfile(event)
  const competitorId = requireCompetitorIdParam(event)

  const row = await loadMarketCompetitor(event, profileId, competitorId)
  const { tablesDB, databaseId } = marketDb(event)

  const profiles = await tablesDB.listRows({
    databaseId,
    tableId: MARKET_PROFILES_TABLE,
    queries: [
      Query.equal('profileId', profileId),
      Query.equal('competitorId', row.$id),
      // Der Verlauf eines Kandidaten kann mehrere Läufe umfassen; 100 deckt
      // jeden realistischen Fall ab und bleibt EINE Abfrage. Nie das
      // Default-25 erben.
      Query.limit(100),
    ],
  })

  for (const profile of profiles.rows) {
    try {
      await tablesDB.deleteRow({ databaseId, tableId: MARKET_PROFILES_TABLE, rowId: profile.$id })
    }
    catch (error) {
      // Idempotent: eine bereits verschwundene Zeile ist das Ziel, nicht ein
      // Fehler.
      if (!isMarketRowMissing(error)) throw error
    }
  }

  await tablesDB.deleteRow({
    databaseId,
    tableId: MARKET_COMPETITORS_TABLE,
    rowId: row.$id,
  })

  logEvent('info', 'market.competitor_removed', { profiles: profiles.rows.length })
  return { removed: true }
})
