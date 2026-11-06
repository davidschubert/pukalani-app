import { z } from 'zod'
import type { MarketCompetitorResponse } from '../../../../../../shared/types/marketApi'
import {
  MARKET_COMPETITOR_DUPLICATE_CODE,
  MARKET_INVALID_URL_CODE,
} from '../../../../../../shared/marketLimits'
import { normalizeMarketUrl } from '../../../../../../shared/marketCrawlRules'
import { requireCompetitorIdParam, requireMarketProfile } from '../../../../../utils/marketAccess'
import {
  listMarketCompetitors,
  loadMarketCompetitor,
  updateMarketCompetitor,
} from '../../../../../utils/marketStore'
import { toMarketCompetitor } from '../../../../../utils/marketViews'

/**
 * EINEN KANDIDATEN ÄNDERN — Name und/oder Adresse.
 *
 * ── EINE NEUE ADRESSE MACHT DEN ABRUFSTAND WERTLOS (§2.9 Nr. 8) ───────────
 * Deshalb setzt sie `status` auf `pending` und LEERT alles, was zur alten
 * Adresse gehört: gelesene Seiten, Rohtext, Frist, Ausschlussgrund. Das ist
 * kein Aufräumen, sondern Wahrheit — ein Rohtext von `alt.example` unter der
 * Adresse `neu.example` wäre ein Beleg, der auf die falsche Marke zeigt, und
 * der Beleg-Riegel prüft gegen ihn.
 *
 * Die MARKTPROFILE bleiben stehen. Sie sind der Verlauf (Anhang B: „ein neuer
 * Abrufstand legt ein neues Profil an, die alten sind der Verlauf"), und der
 * nächste Lauf legt ein neues an — der `inputHash` des alten passt zum neuen
 * Rohtext ohnehin nie.
 */

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  url: z.string().trim().max(512).optional(),
})

export default defineEventHandler(async (event): Promise<MarketCompetitorResponse> => {
  const { profileId } = await requireMarketProfile(event)
  const competitorId = requireCompetitorIdParam(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ status: 400, statusText: 'Invalid competitor' })
  const body = parsed.data

  // Lädt UND belegt die Zugehörigkeit (404 auf eine fremde Zeile).
  const row = await loadMarketCompetitor(event, profileId, competitorId)

  const data: Record<string, string | null> = {}
  if (body.name !== undefined) data.name = body.name

  if (body.url !== undefined) {
    const normalized = normalizeMarketUrl(body.url)
    if (!normalized) {
      throw createError({
        status: 400,
        statusText: 'Invalid competitor URL',
        data: { code: MARKET_INVALID_URL_CODE },
      })
    }
    const previous = normalizeMarketUrl(row.url ?? '')
    if (normalized.hostKey !== previous?.hostKey) {
      const others = await listMarketCompetitors(event, profileId)
      const duplicate = others.some((other) => {
        if (other.$id === row.$id) return false
        return normalizeMarketUrl(other.url ?? '')?.hostKey === normalized.hostKey
      })
      if (duplicate) {
        throw createError({
          status: 409,
          statusText: 'Competitor already exists',
          data: { code: MARKET_COMPETITOR_DUPLICATE_CODE },
        })
      }
    }

    if (normalized.url !== row.url) {
      data.url = normalized.url
      data.status = 'pending'
      data.excludedReason = ''
      data.pagesFetched = ''
      data.fetchedAt = null
      data.rawText = null
      data.rawExpiresAt = null
    }
  }

  if (!Object.keys(data).length) return { competitor: toMarketCompetitor(row) }

  const updated = await updateMarketCompetitor(event, profileId, competitorId, data)
  return { competitor: toMarketCompetitor(updated) }
})
