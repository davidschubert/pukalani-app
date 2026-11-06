/**
 * DER DROSSEL-VERTRAG DES MARKTVERGLEICHS (Plan §2.8) — die Zahlen, die
 * Eimer-Schlüssel und die Entscheidung, pur und ohne h3.
 *
 * Dasselbe Muster wie `packages/brand/shared/brandAiLimits.ts`, und aus
 * demselben Grund: ein Deckel, der als abgeschriebene Zeichenkette in zwei
 * Routen lebt, ist beim ersten Umbenennen zwei verschiedene Deckel.
 *
 * ── WARUM DER EIMER SCHON IN M2 STEHT UND NICHT ERST IN M5 ────────────────
 * Der Plan legt ihn in M5 („Betrieb"). Ab M2 gibt es aber echte Modell-Aufrufe
 * (Extraktion je Wettbewerber, KI-Aussensicht mit zwei Modellen je
 * Wettbewerber) — ein Lauf über fünf Kandidaten kostet damit bis zu fünfzehn
 * Anbieter-Antworten. Ein Kostendeckel, der erst NACH der ersten Rechnung
 * eingebaut wird, ist keiner. Die Abweichung ist in §5 des Plans vermerkt.
 *
 * ── WARUM ER NICHT AUF DEM brand-EIMER MITZÄHLT ───────────────────────────
 * Er beantwortet eine andere Frage. `brandAiSlotDayKey` & Co. begrenzen, wie
 * oft ein Mensch AN SEINEM EIGENEN Text arbeiten lässt; dieser Eimer begrenzt,
 * wie oft wir FREMDE Server anfassen und dafür bezahlen. Auf dem Gesprächs-
 * oder Slot-Eimer gebucht, nähme ein Marktlauf dem Menschen die Entwürfe für
 * die Felder, über die er gerade etwas erfahren wollte — dieselbe Begründung
 * wie beim Review-Eimer des Spezialisten.
 */

/** Läufe je BRANDING und Tag (§2.8: „Eimer `market`: 3 Läufe je Branding und Tag"). */
export const MARKET_RUN_DAILY_LIMIT = 3

/**
 * Läufe je INSTANZ und Tag über alle Konten — das Kosten-Netz des Betreibers.
 *
 * 50 ist aus dem Deckel darüber gerechnet: bei 3 Läufen je Branding sind das
 * gut sechzehn Brandings, die ihr Tageskontingent voll ausschöpfen. In der
 * Beta gibt es die nicht; der Deckel gehört angehoben, wenn er echte Nutzung
 * abschneidet — dafür ist er konfigurierbar
 * (`pukalani.market.runDailyInstanceCap`).
 */
export const MARKET_RUN_INSTANCE_DAILY_DEFAULT = 50

/** Rollierende 24 Stunden, kein Kalendertag — wie bei allen anderen Eimern. */
export const MARKET_RUN_DAY_WINDOW_MS = 24 * 60 * 60_000

export interface MarketRunLimits {
  profileDay: number
  instanceDay: number
}

export const MARKET_RUN_LIMITS: MarketRunLimits = {
  profileDay: MARKET_RUN_DAILY_LIMIT,
  instanceDay: MARKET_RUN_INSTANCE_DAILY_DEFAULT,
}

/**
 * Der Instanz-Deckel aus der App-Konfiguration — oder der Default. Nur eine
 * ganze Zahl > 0 zählt: eine `0` würde das Produkt abschalten, ohne dass
 * irgendwo „aus" stünde. Abschalten geht über `app_config.brandAiEnabled`
 * (KI) und `app_config.products.market.enabled` (Produkt).
 */
export function resolveMarketInstanceCap(configured: unknown): number {
  return typeof configured === 'number' && Number.isInteger(configured) && configured > 0
    ? configured
    : MARKET_RUN_INSTANCE_DAILY_DEFAULT
}

// ── Die Eimer-Schlüssel ────────────────────────────────────────────────────

/** Ein Branding, ein Tag. Ohne Konto: wer zwei Marken führt, vergleicht zweimal. */
export function marketRunDayKey(profileId: string): string {
  return `market-run-day:${profileId}`
}

/** EIN Eimer für die ganze Instanz — ohne Konto, ohne Branding. */
export function marketRunInstanceDayKey(): string {
  return 'market-run-instance-day'
}

/**
 * DER EIGENE TAGES-EIMER DES VERGLEICHS (MV1 M3) — neben dem des Laufs, nicht
 * darin.
 *
 * ── WARUM NICHT DERSELBE ──────────────────────────────────────────────────
 * Aus Kundensicht ist „Markt vergleichen" EIN Knopf; technisch sind es zwei
 * Schritte (`run` holt und wertet aus, `report` vergleicht), und die
 * Oberfläche ruft beide nacheinander. Teilten sie einen Eimer, verbrauchte ein
 * einziger Klick zwei von drei Tages-Läufen — der Deckel läge faktisch bei
 * eineinhalb. Ausserdem ist ein Bericht OHNE Lauf ein normaler Vorgang: wer
 * ein eigenes Feld korrigiert, will den Vergleich neu rechnen, ohne fünf
 * fremde Websites erneut zu belästigen.
 *
 * ── DER INSTANZ-DECKEL BLEIBT GETEILT ─────────────────────────────────────
 * Er zählt keine Klicks, sondern KOSTEN: jeder Bericht ist ein Modell-Aufruf,
 * und ein zweiter Instanz-Zähler daneben verdoppelte die Rechnung, die er
 * begrenzen soll (`marketRunInstanceDayKey`).
 */
export function marketReportDayKey(profileId: string): string {
  return `market-report-day:${profileId}`
}

// ── Die Ablehnungsgründe ───────────────────────────────────────────────────

/**
 * Sie reisen als `data.code` in der 429 und werden vom zentralen Fehler-Handler
 * als `reason` ins Envelope gehoben. ZWEI Codes, weil sie dem Menschen
 * Verschiedenes sagen: „morgen wieder" gegen „nicht an dir".
 */
export const MARKET_RUN_LIMIT_CODE = 'market_run_limit'
export const MARKET_INSTANCE_LIMIT_CODE = 'market_instance_limit'

export type MarketRunRejectionCode
  = typeof MARKET_RUN_LIMIT_CODE
    | typeof MARKET_INSTANCE_LIMIT_CODE

export interface MarketRunCounts {
  /** Zählerstand des Branding-Eimers NACH dieser Buchung. */
  profileDay: number
  /** Zählerstand des Instanz-Eimers NACH dieser Buchung. */
  instanceDay: number
}

/** `null` = der Lauf darf laufen. Sonst der erste verletzte Deckel. */
export function decideMarketRunQuota(
  counts: MarketRunCounts,
  limits: MarketRunLimits = MARKET_RUN_LIMITS,
): MarketRunRejectionCode | null {
  if (counts.profileDay > limits.profileDay) return MARKET_RUN_LIMIT_CODE
  if (counts.instanceDay > limits.instanceDay) return MARKET_INSTANCE_LIMIT_CODE
  return null
}

// ── Fachliche Ablehnungsgründe der Routen ──────────────────────────────────

/**
 * Sie sind KEINE Drossel, sondern Antworten auf „darf das hier überhaupt?" —
 * und sie stehen hier, weil der Client sie liest und sie damit Teil des
 * Vertrags sind, nicht eines Handlers.
 */
export const MARKET_LOCKED_CODE = 'market_locked'
export const MARKET_COMPETITOR_LIMIT_CODE = 'competitor_limit'
export const MARKET_COMPETITOR_DUPLICATE_CODE = 'competitor_duplicate'
export const MARKET_INVALID_URL_CODE = 'competitor_url_invalid'
/**
 * Es gibt nur EINE eigene alte Website je Branding (§7.2 Nr. 2, MV1 M4).
 * Eigener Code neben `competitor_limit`, weil es ein anderer Deckel mit einer
 * anderen Zahl ist — ein gemeinsamer Code führte zu dem Satz „höchstens fünf",
 * wo „höchstens eine" gemeint ist.
 */
export const MARKET_SELF_LIMIT_CODE = 'self_limit'
/**
 * Die gewählte fremde Marke ist nicht (mehr) freigegeben (§7.2 Nr. 4, MV1 M4)
 * — beim ANLEGEN. Der LAUF sagt dasselbe anders: er schliesst den Kandidaten
 * mit `excludedReason: 'withdrawn'` aus, statt den ganzen Lauf abzubrechen.
 */
export const MARKET_SHARED_UNAVAILABLE_CODE = 'shared_unavailable'
export const MARKET_AI_DISABLED_CODE = 'ai_disabled'
/**
 * KEIN VERGLEICHBARES MATERIAL (MV1 M3): kein einziger Kandidat trägt ein
 * Marktprofil. Ein Bericht über null Marken wäre kein leerer Bericht, sondern
 * eine erfundene Aussage über ein Feld, das niemand gelesen hat — und ein
 * bezahlter Modell-Aufruf dafür.
 */
export const MARKET_NO_PROFILES_CODE = 'market_no_profiles'
