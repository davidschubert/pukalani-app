import type { MarketReportResponse } from '../../../../../shared/types/marketApi'
import { MARKET_NO_PROFILES_CODE } from '../../../../../shared/marketLimits'
import { readBrandAiEnabled } from '../../../../contracts/brandContract'
import { requireMarketProfile, requireMarketUnlocked } from '../../../../utils/marketAccess'
import { loadMarketReportState, produceMarketReport } from '../../../../utils/marketReportService'

/**
 * DER VERGLEICH (Plan §2.3 Nr. 4, MV1 M3).
 *
 * ── ER RUFT NICHT AB ──────────────────────────────────────────────────────
 * Diese Route rechnet über den Stand, der DA IST. Das Holen ist der Lauf
 * (`run.post.ts`, M2), und die Trennung ist Absicht: nach einer Korrektur an
 * einem eigenen Feld will der Kunde einen neuen Vergleich, aber ganz sicher
 * nicht fünf fremde Websites ein zweites Mal belästigen.
 *
 * ── DIE REIHENFOLGE IST DIE KOSTENKONTROLLE ───────────────────────────────
 *  1. Freischaltung (Kapitel B) — dieselbe Schranke wie beim Lauf.
 *  2. Stand laden. Kostet nichts.
 *  3. Ohne EIN Marktprofil ⇒ 409 `market_no_profiles`. Ein Bericht über null
 *     Marken wäre kein leerer Bericht, sondern eine erfundene Aussage über ein
 *     Feld, das niemand gelesen hat — und ein bezahlter Aufruf dafür.
 *  4. Gibt es zu diesem Stand schon einen Bericht ⇒ ihn zurück, ohne Buchung
 *     und ohne Modell (§2.3 Nr. 5).
 *  5. Erst dann: KI-Schalter, Deckel, Aufruf.
 * Die Schritte 3–5 stehen in `produceMarketReport`, weil der Lauf mit
 * `withReport` dieselbe Rechnung braucht.
 *
 * ── `stale` IST HIER IMMER `false` ────────────────────────────────────────
 * Die Antwort ist der Bericht ZU DIESEM Stand — frisch gerechnet oder aus der
 * Ablage, aber in beiden Fällen der aktuelle. Veralten kann er erst durch die
 * nächste Änderung, und das sagt die GET-Route.
 */
export default defineEventHandler(async (event): Promise<MarketReportResponse> => {
  const { profileId, profile } = await requireMarketProfile(event)
  await requireMarketUnlocked(event, profileId)

  const [state, aiEnabled] = await Promise.all([
    loadMarketReportState(event, profileId),
    readBrandAiEnabled(event),
  ])

  if (state.withProfile === 0) {
    throw createError({
      status: 409,
      statusText: 'No market profiles to compare',
      data: { code: MARKET_NO_PROFILES_CODE },
    })
  }

  const { view, reused } = await produceMarketReport(event, profileId, state, {
    locale: profile.contentLocale,
    aiEnabled,
  })

  return { report: view, stale: false, reused, aiEnabled }
})
