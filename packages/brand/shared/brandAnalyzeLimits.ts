/**
 * DER DECKEL DER URL-ANALYSE — bewusst NEBEN `brandAiLimits.ts`, nicht darin.
 *
 * ── WARUM EINE EIGENE DATEI ───────────────────────────────────────────────
 * Die Analyse kostet KEINEN KI-Aufruf: sie holt eine Seite, wirft Tags weg und
 * legt Text in eine Spalte. Sie in das Generierungs-Kontingent zu buchen hiesse,
 * jemandem einen Entwurf wegzunehmen, weil er seine eigene Website lesen liess
 * — zwei verschiedene Rechnungen unter einer Zahl. Was sie kostet, ist etwas
 * anderes: eine ausgehende Verbindung von unserem Server, und die ist der
 * Grund für den Deckel (Rufmord durch Fremdlast, Scanner-Verhalten), nicht
 * eine Anbieter-Rechnung.
 *
 * ── ZWEI DECKEL, ZWEI FRAGEN ──────────────────────────────────────────────
 * Diese Datei trägt den TAGES-Deckel je KONTO. Die zweite Bremse ist der
 * IP-Eimer in `core/server/middleware/05.rate-limit.ts` (`brand:analyze`, 3/min)
 * — er zählt VOR jeder Zeile und begrenzt das Tempo; dieser hier begrenzt die
 * Menge und kennt dafür den Menschen.
 *
 * Rollierende 24 Stunden, kein Kalendertag — dieselbe Begründung wie bei
 * `BRAND_AI_DAY_WINDOW_MS`: sonst wäre um Mitternacht schlagartig alles offen.
 */

/**
 * Zwanzig Analysen je Konto und Tag. Grosszügig gegenüber dem echten Gebrauch
 * (eine Website je Branding, gelesen, wenn sie sich geändert hat) und trotzdem
 * weit unterhalb dessen, was ein Skript als Werkzeug brauchbar machte.
 */
export const BRAND_ANALYZE_ACCOUNT_DAILY_LIMIT = 20

export const BRAND_ANALYZE_DAY_WINDOW_MS = 24 * 60 * 60_000

/** Alle Analysen EINES Kontos, über alle Brandings. Wer drei Marken baut, hat eine Rechnung. */
export function brandAnalyzeDayKey(userId: string): string {
  return `brand-analyze-day:${userId}`
}

/**
 * Der Ablehnungsgrund. EINER, nicht vier: hier gibt es nur eine Frage („wie oft
 * heute?"), und ein Code, den niemand unterscheiden kann, wäre ein Code zu viel.
 */
export const BRAND_ANALYZE_DAILY_LIMIT_CODE = 'brand_analyze_daily_limit'

/**
 * `>` statt `>=`, weil `store.hit()` den Zähler EINSCHLIESSLICH dieses Laufs
 * liefert: die 20. Analyse des Tages ist erlaubt, die 21. nicht.
 */
export function brandAnalyzeQuotaExceeded(
  count: number,
  limit: number = BRAND_ANALYZE_ACCOUNT_DAILY_LIMIT,
): boolean {
  return count > limit
}
