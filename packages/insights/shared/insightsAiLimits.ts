/**
 * DIE KI-DROSSEL DER REDAKTION (Plan §9.4, §11 Frage 4: „10/Stunde je Konto,
 * Tages-Eimer 50 — dieselbe Bauart wie `brand/shared/brandAiLimits.ts`").
 *
 * ── WARUM EIN BETREIBER ÜBERHAUPT GEDECKELT WIRD ──────────────────────────
 * „Auch ein Betreiber kann einen Knopf verklemmen" (§9.4). Der Deckel steht
 * hier nicht gegen Missbrauch — hinter `insights.manage` sitzt der Betreiber
 * selbst —, sondern gegen den Unfall: ein hängender Aufruf, ein doppelter
 * Klick, eine Schleife im Formular. Jeder dieser Fälle kostet beim Anbieter
 * Geld, und zwar sofort.
 *
 * ── ZWEI EIMER, ZWEI FRAGEN ───────────────────────────────────────────────
 *  · STUNDE (10): „wie schnell?" — sie fängt den verklemmten Knopf, ohne den
 *    Tag zu verbrauchen. Wer zehn Übersetzungen in einer Stunde braucht,
 *    arbeitet nicht mehr, sondern klickt.
 *  · TAG (50): „wie viel?" — die Rechnung des Tages. Rollierende 24 Stunden
 *    und kein Kalendertag, sonst wäre um Mitternacht schlagartig alles offen
 *    (wörtlich dieselbe Begründung wie `BRAND_AI_DAY_WINDOW_MS`).
 *
 * ── ZWEI EIMER JE ART, NICHT EINER FÜR BEIDE ──────────────────────────────
 * `kind` (`translate` | `draft`) steht IM SCHLÜSSEL. Beide Läufe kosten
 * ähnlich viel, aber sie beantworten verschiedene Fragen: wer einen Nachmittag
 * lang übersetzt, soll nicht dadurch seine Entwürfe verlieren. Vor allem sagt
 * ein getrennter Eimer im Log die Wahrheit — „zu oft übersetzt" an einer
 * Stelle, an der niemand übersetzt hat, wäre die falsche Auskunft.
 *
 * ── WARUM DIESE DATEI PUR IST ─────────────────────────────────────────────
 * Kein `H3Event`, kein Store, kein Appwrite: die Zahlen und die Schlüssel
 * müssen ohne Nitro prüfbar sein. WANN gezählt wird, steht in
 * `server/utils/insightsAi.ts`.
 */

/** Höchstens zehn Modell-Läufe je Konto und Art in einer Stunde. */
export const INSIGHTS_AI_HOURLY_LIMIT = 10

/** Höchstens fünfzig Modell-Läufe je Konto und Art in 24 rollierenden Stunden. */
export const INSIGHTS_AI_DAILY_LIMIT = 50

export const INSIGHTS_AI_HOUR_WINDOW_MS = 60 * 60_000
export const INSIGHTS_AI_DAY_WINDOW_MS = 24 * 60 * 60_000

/**
 * Die Läufe der Redaktion, die ein Modell rufen (§9.4) — seit BI2 K5 drei.
 *
 * `brief` (Brief aus einem Video) teilt die Zahlen oben, hat aber seinen
 * EIGENEN Eimer, wie jede Art: zehn in der Stunde, fünfzig am Tag. Das ist
 * bewusst nicht enger, obwohl ein Video-Lauf der teuerste ist (gemessen rund
 * fünf Cent je 25-Minuten-Video, also höchstens ~2,50 € am Tag) — eine
 * zweite, strengere Zahl an genau dieser Stelle wäre eine Regel ohne Anlass,
 * und der Deckel, der hier wirklich trägt, ist der Mensch, der jedes Video
 * selbst in die Liste gelegt hat.
 */
export type InsightsAiKind = 'translate' | 'draft' | 'brief'

/**
 * Der Stunden-Eimer EINES Kontos für EINE Art. `kind` vor `userId`, damit die
 * Schlüssel eines Laufs im Redis-Namensraum beieinander liegen.
 */
export function insightsAiHourKey(userId: string, kind: InsightsAiKind): string {
  return `insights-ai-hour:${kind}:${userId}`
}

/** Der Tages-Eimer EINES Kontos für EINE Art. */
export function insightsAiDayKey(userId: string, kind: InsightsAiKind): string {
  return `insights-ai-day:${kind}:${userId}`
}

/**
 * DIE ABLEHNUNGSGRÜNDE — sie reisen als `data.code` und werden vom zentralen
 * Handler (`core/server/error.ts`) als `reason` ins Envelope gehoben.
 *
 * DREI und nicht einer, weil sie dem Menschen VERSCHIEDENE Dinge sagen:
 * „gleich wieder" (Stunde), „morgen wieder" (Tag) und „der Betreiber hat die
 * KI abgeschaltet" (Kill-Switch) — der letzte ist kein Deckel, sondern eine
 * Entscheidung, und ein Wartehinweis wäre dort schlicht falsch.
 */
export const INSIGHTS_AI_HOURLY_LIMIT_CODE = 'ai_hourly_limit'
export const INSIGHTS_AI_DAILY_LIMIT_CODE = 'ai_daily_limit'
export const INSIGHTS_AI_DISABLED_CODE = 'ai_disabled'

export type InsightsAiRejectionCode =
  | typeof INSIGHTS_AI_HOURLY_LIMIT_CODE
  | typeof INSIGHTS_AI_DAILY_LIMIT_CODE
  | typeof INSIGHTS_AI_DISABLED_CODE

export interface InsightsAiCounts {
  hour: number
  day: number
}

/**
 * DIE ENTSCHEIDUNG — eng vor weit, und `>` statt `>=`: gezählt wird beim
 * START, der eigene Lauf steckt also schon im Zählerstand. Bei einem Deckel
 * von 10 ist der zehnte Lauf der letzte erlaubte, der elfte der erste
 * abgelehnte.
 */
export function decideInsightsAiQuota(counts: InsightsAiCounts): InsightsAiRejectionCode | null {
  if (counts.hour > INSIGHTS_AI_HOURLY_LIMIT) return INSIGHTS_AI_HOURLY_LIMIT_CODE
  if (counts.day > INSIGHTS_AI_DAILY_LIMIT) return INSIGHTS_AI_DAILY_LIMIT_CODE
  return null
}
