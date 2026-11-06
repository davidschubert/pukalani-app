import { z } from 'zod'
import type { MarketVisibilityResponse } from '../../../../../shared/types/marketApi'
import {
  BRAND_MARKET_VISIBILITIES,
  brandMarketVisibilityOf,
  setBrandProfileMarketVisibility,
} from '../../../../contracts/brandContract'
import { requireMarketProfile } from '../../../../utils/marketAccess'

/**
 * DAS OPT-IN SETZEN ODER WIDERRUFEN (Plan §7.2 Nr. 4, MV1 M4).
 *
 * ── WARUM DIESE ROUTE IM market-LAYER LIEGT UND NICHT IN brand ───────────
 * Die Spalte gehört `brand_profiles` — der Schalter gehört dem MARKTVERGLEICH.
 * Ein `PATCH /api/brand/profiles/:id` um ein Feld zu erweitern hiesse, dem
 * brand-Layer ein Produkt einzubauen, das er nicht kennen darf (CONCEPT A14):
 * eine Silo-App ohne `market` bekäme ein Feld, hinter dem nichts liegt, und
 * seine Bedeutung stünde in einem fremden Plan. Geschrieben wird deshalb von
 * hier — aber NICHT in die Tabelle: das tut `setBrandProfileMarketVisibility`
 * im brand-Layer, über den Vertrag geholt. Die Grenze ist der Vertrag, nicht
 * die Datei.
 *
 * ── OHNE FREISCHALTUNGS-SCHRANKE ─────────────────────────────────────────
 * Wie die Kandidatenliste (Kopf von `marketAccess.ts`): eine Zustimmung zu
 * geben kostet nichts und ruft kein Modell. Wer sie erst nach Kapitel B geben
 * dürfte, könnte seine Marke genau in dem Moment nicht freigeben, in dem er
 * die Seite zum ersten Mal liest.
 *
 * ── DER BESITZ IST DIE EINZIGE GRENZE ────────────────────────────────────
 * `requireMarketProfile` belegt ihn (404 auf ein fremdes Branding, nie 403).
 * Eine Freigabe für eine fremde Marke wäre der schlimmste denkbare Fehler
 * dieses Produkts — deshalb geht die Id NIE aus dem Rumpf, sondern immer aus
 * dem Pfad, und der Rumpf trägt ausschliesslich den Wert.
 *
 * ── NICHT FAIL-SOFT ──────────────────────────────────────────────────────
 * Wer ein Häkchen setzt, muss erfahren, ob es gilt. Antwortet die Route,
 * antwortet sie mit dem GESPEICHERTEN Stand — nie mit dem Wunsch aus dem
 * Rumpf.
 */

const bodySchema = z.object({
  marketVisibility: z.enum(BRAND_MARKET_VISIBILITIES),
})

export default defineEventHandler(async (event): Promise<MarketVisibilityResponse> => {
  const { profileId } = await requireMarketProfile(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ status: 400, statusText: 'Invalid visibility' })

  const row = await setBrandProfileMarketVisibility(event, profileId, parsed.data.marketVisibility)

  logEvent('info', 'market.visibility_changed', {
    // Nur die Tatsache, kein Name und keine Id eines Menschen (Log-Regel).
    visibility: parsed.data.marketVisibility,
  })

  return { marketVisibility: brandMarketVisibilityOf(row) }
})
