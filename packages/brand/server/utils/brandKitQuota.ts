import type { H3Event } from 'h3'
import {
  BRAND_KIT_DAILY_LIMIT,
  BRAND_KIT_DAY_WINDOW_MS,
  type BrandKitRejectionCode,
  brandKitDayKey,
  decideBrandKitQuota,
} from '../../shared/brandKitLimits'

/**
 * DIE BUCHUNG EINES KIT-ABRUFS (Konzept docs/plans/BRAND-BOOK-KIT.md §2.11,
 * Paket K2) — EIN Zähler, dasselbe Muster wie `bookBrandAiQuota`, aber eine
 * andere Frage (dort Geld beim Anbieter, hier Rechenzeit bei uns).
 *
 * ── GEBUCHT WIRD VOR DEM BAUEN ───────────────────────────────────────────
 * Dieselbe Richtung wie bei den KI-Eimern: wer den Deckel erst nach der
 * Rechnung fragte, hätte die Rechnung schon bezahlt. Der Deckel steht genau
 * gegen die Wiederholung dieser Rechnung.
 *
 * ── FAIL-OPEN, WIE ÜBERALL ───────────────────────────────────────────────
 * Der Rate-Limit-Store des Core ist fail-open (toter Redis ⇒ In-Memory). Das
 * bleibt so: eine kaputte Drossel darf einen Download nicht verhindern. Der
 * Deckel ist eine Bremse gegen ein Skript, kein Sicherheits-Riegel — der
 * heißt `requireBrandAccess` plus Besitz plus Freischaltung.
 *
 * ── DAS GEWICHT IST EIN ZWEITER TREFFER, KEIN FAKTOR ─────────────────────
 * Dieselbe Begründung wie beim Review-Eimer: der Store des Core kennt genau
 * eine Zählart. Das Bündel (K6, Gewicht 5) bucht deshalb fünfmal auf denselben
 * Schlüssel und entscheidet nach dem LETZTEN Stand.
 */
export interface BrandKitQuotaRejection {
  code: BrandKitRejectionCode
  /** Sekunden bis zur nächsten Chance — der Wert des `Retry-After`-Kopfes. */
  retryAfterSec: number
}

export async function bookBrandKitDownload(
  event: H3Event,
  profileId: string,
  weight = 1,
): Promise<BrandKitQuotaRejection | null> {
  const { store, prefix } = useRateLimitStore(event)
  const key = `${prefix}${brandKitDayKey(profileId)}`
  const hits = Math.max(1, Math.trunc(weight))

  let state = await store.hit(key, BRAND_KIT_DAY_WINDOW_MS)
  for (let extra = 1; extra < hits; extra++) {
    state = await store.hit(key, BRAND_KIT_DAY_WINDOW_MS)
  }

  const code = decideBrandKitQuota(state.count, BRAND_KIT_DAILY_LIMIT)
  if (!code) return null
  return { code, retryAfterSec: Math.max(1, Math.ceil(state.resetInMs / 1000)) }
}
