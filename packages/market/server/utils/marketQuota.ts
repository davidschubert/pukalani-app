import type { H3Event } from 'h3'
import type { MarketRunCounts, MarketRunRejectionCode } from '../../shared/marketLimits'
import {
  MARKET_RUN_DAY_WINDOW_MS,
  MARKET_RUN_LIMITS,
  decideMarketRunQuota,
  marketReportDayKey,
  marketRunDayKey,
  marketRunInstanceDayKey,
  resolveMarketInstanceCap,
} from '../../shared/marketLimits'

/**
 * DIE BUCHUNG EINES LAUFS — zwei Zähler, eng vor weit, Abbruch beim ersten
 * Nein. Die Zahlen und die Entscheidung stehen pur in `marketLimits.ts`; hier
 * steht nur, WANN gezählt wird.
 *
 * ── GEBUCHT WIRD, WAS ETWAS KOSTET ────────────────────────────────────────
 * Die Route ruft diese Funktion, NACHDEM sie weiss, dass es überhaupt etwas
 * zu tun gibt (mindestens ein Kandidat ohne aktuelles Profil). Ein Lauf, der
 * nur gespeicherte Profile zurückgibt, holt keine fremde Seite und ruft kein
 * Modell — „was nichts kostet, kostet kein Kontingent" (dieselbe Regel wie im
 * brand-Layer und bei der UGC-Übersetzung).
 *
 * Gebucht wird dann aber am START und nicht beim Erfolg: die Anfragen sind
 * raus, sobald der Lauf beginnt, und die Gegenregel wäre ein Geschenk an
 * genau den Missbrauch, gegen den der Deckel steht.
 *
 * ── FAIL-OPEN, WIE ÜBERALL ────────────────────────────────────────────────
 * Der Rate-Limit-Store ist fail-open (toter Redis ⇒ In-Memory je Prozess).
 * Der harte Riegel gegen Kosten ist `app_config.brandAiEnabled`, nicht dieser
 * Zähler.
 */

export interface MarketRunRejection {
  code: MarketRunRejectionCode
  /** Sekunden bis zur nächsten Chance — der Wert des `Retry-After`-Kopfes. */
  retryAfterSec: number
}

function retryAfter(resetInMs: number): number {
  return Math.max(1, Math.ceil(resetInMs / 1000))
}

/** `pukalani.market.runDailyInstanceCap` — ungeprüft; die Prüfung ist pur. */
function instanceCapFromConfig(): unknown {
  const config = useAppConfig() as { pukalani?: { market?: { runDailyInstanceCap?: unknown } } }
  return config.pukalani?.market?.runDailyInstanceCap
}

export async function bookMarketRun(
  event: H3Event,
  profileId: string,
): Promise<MarketRunRejection | null> {
  return await book(event, marketRunDayKey(profileId))
}

/**
 * DER VERGLEICH (MV1 M3) — eigener Tages-Eimer je Branding, GETEILTER
 * Instanz-Deckel. Begründung an `marketReportDayKey`.
 */
export async function bookMarketReport(
  event: H3Event,
  profileId: string,
): Promise<MarketRunRejection | null> {
  return await book(event, marketReportDayKey(profileId))
}

async function book(event: H3Event, profileKey: string): Promise<MarketRunRejection | null> {
  const limits = {
    ...MARKET_RUN_LIMITS,
    instanceDay: resolveMarketInstanceCap(instanceCapFromConfig()),
  }
  const counts: MarketRunCounts = { profileDay: 0, instanceDay: 0 }
  const { store, prefix } = useRateLimitStore(event)

  const profileState = await store.hit(`${prefix}${profileKey}`, MARKET_RUN_DAY_WINDOW_MS)
  counts.profileDay = profileState.count
  const narrow = decideMarketRunQuota(counts, limits)
  if (narrow) return { code: narrow, retryAfterSec: retryAfter(profileState.resetInMs) }

  const instanceState = await store.hit(`${prefix}${marketRunInstanceDayKey()}`, MARKET_RUN_DAY_WINDOW_MS)
  counts.instanceDay = instanceState.count
  const wide = decideMarketRunQuota(counts, limits)
  return wide ? { code: wide, retryAfterSec: retryAfter(instanceState.resetInMs) } : null
}
