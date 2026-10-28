import type { H3Event } from 'h3'
import type { InsightsAiKind } from '../../shared/insightsAiLimits'
import {
  INSIGHTS_AI_DAY_WINDOW_MS,
  INSIGHTS_AI_DISABLED_CODE,
  INSIGHTS_AI_HOUR_WINDOW_MS,
  decideInsightsAiQuota,
  insightsAiDayKey,
  insightsAiHourKey,
} from '../../shared/insightsAiLimits'
import { BRAND_PROVIDER_ROUTING, readBrandAiEnabled } from '../contracts/brandContract'

/**
 * DIE KETTE VOR JEDEM MODELL-AUFRUF DER REDAKTION (§9.4) — in dieser
 * Reihenfolge, und die Reihenfolge ist selbst eine Regel:
 *
 *  1. `insights.manage` (in der Route, davor),
 *  2. KILL-SWITCH — ist die KI dieser Instanz überhaupt an?
 *  3. DROSSEL — Stunde, dann Tag,
 *  4. erst dann der Anbieter.
 *
 * Wer erst ruft und dann fragt, hat gerufen. Der Kill-Switch steht VOR der
 * Drossel, weil ein abgeschalteter Anbieter keinen Eimer verbrauchen darf:
 * sonst kostete ein Betriebszustand den Menschen sein Tageskontingent.
 *
 * ── GEBUCHT WIRD BEIM START, NICHT BEIM ERFOLG ───────────────────────────
 * Wörtlich dieselbe Regel wie im brand-Layer: ein Lauf, der beim Anbieter
 * scheitert, ist bezahlt — die Anfrage ist raus. Die Gegenregel wäre ein
 * Geschenk an den verklemmten Knopf, gegen den der Deckel steht.
 */

export interface InsightsAiRun {
  /** Das Modell, das der Lauf benutzt — gespeichert je Beitrag (§9.4). */
  model: string
  /**
   * Die Datenschutz-Bedingungen, unverändert aus dem brand-Vertrag. Der Typ
   * ist AUSGESCHRIEBEN statt `typeof BRAND_PROVIDER_ROUTING`: jenes Objekt ist
   * `as const`, seine Felder wären damit `readonly true`/`readonly 'deny'` —
   * und ein Aufrufer, der sie an `aiCompleteJson` reicht, bekäme einen
   * Varianz-Fehler für einen Wert, der genau richtig ist.
   */
  providerRouting: { zdr: boolean, dataCollection: 'allow' | 'deny', allowFallbacks: boolean }
}

/**
 * KLINKE UND DROSSEL — wirft 409 (`ai_disabled`) bzw. 429
 * (`ai_hourly_limit` / `ai_daily_limit`) und gibt sonst zurück, WOMIT
 * gerufen wird.
 *
 * Das Modell kommt aus `getEffectiveAiConfig` (Core): `app_config.aiModel`
 * schlägt den Build-Default — dieselbe Kette wie beim Brand-Check, damit ein
 * Modellwechsel EINE Stelle hat.
 */
export async function insightsBeginAiRun(
  event: H3Event,
  userId: string,
  kind: InsightsAiKind,
): Promise<InsightsAiRun> {
  if (!await readBrandAiEnabled(event)) {
    throw createError({
      status: 409,
      statusText: 'AI disabled',
      data: { code: INSIGHTS_AI_DISABLED_CODE },
    })
  }

  const { store, prefix } = useRateLimitStore(event)
  const hour = await store.hit(`${prefix}${insightsAiHourKey(userId, kind)}`, INSIGHTS_AI_HOUR_WINDOW_MS)
  const hourly = decideInsightsAiQuota({ hour: hour.count, day: 0 })
  if (hourly) {
    throw createError({
      status: 429,
      statusText: 'Too many requests',
      data: { code: hourly },
    })
  }

  const day = await store.hit(`${prefix}${insightsAiDayKey(userId, kind)}`, INSIGHTS_AI_DAY_WINDOW_MS)
  const daily = decideInsightsAiQuota({ hour: hour.count, day: day.count })
  if (daily) {
    throw createError({
      status: 429,
      statusText: 'Too many requests',
      data: { code: daily },
    })
  }

  const { model } = await getEffectiveAiConfig(event)
  return { model, providerRouting: { ...BRAND_PROVIDER_ROUTING } }
}

/**
 * DAS EREIGNIS-PROTOKOLL EINES LAUFS — Regel 1 aus `brandEvents.ts`: **nie
 * Prompt, nie Text**.
 *
 * ── WARUM KEINE ZEILE IN `brand_events` ──────────────────────────────────
 * §9.4 nennt das brand-Events-MUSTER, und das Muster ist hier übernommen. Die
 * TABELLE ist es nicht: der Vertrag zum brand-Layer ist bewusst LESEND (Kopf
 * von `brandContract.ts`, „Alles Schreibende" fehlt dort mit Begründung), und
 * eine Redaktion über FREMDE Marken hat in der Ereignis-Tabelle des
 * KUNDEN-Wizards nichts zu suchen. Solange niemand diese Zahlen auswertet, ist
 * die strukturierte Log-Zeile die ehrlichere Ablage — sie kostet keine
 * Tabelle, keine Aufbewahrungsfrist und keinen GDPR-Beitrag.
 *
 * Geloggt wird, was eine Rechnung erklärt: Beitrag, Format, Modell,
 * Prompt-Fassung, Dauer, Fehlercode. Der Brief des Menschen und der erzeugte
 * Text stehen NICHT dabei — sie sind Inhalt, kein Betriebsdatum.
 */
/**
 * DER FEHLERCODE EINES GESCHEITERTEN LAUFS — für die Log-Zeile, nie für den
 * Client. `error.name` allein sagt „Error" (im Klick-Beweis I2 stand genau das
 * neben einem 503 „AI not configured"); ein H3-Fehler trägt Status und
 * Statustext, und die sagen, WAS gefehlt hat. Kein Prompt, kein Text.
 */
export function insightsAiErrorCode(error: unknown): string {
  const h3 = error as { status?: unknown, statusCode?: unknown, statusText?: unknown, statusMessage?: unknown } | null
  const status = typeof h3?.status === 'number' ? h3.status : (typeof h3?.statusCode === 'number' ? h3.statusCode : undefined)
  const text = typeof h3?.statusText === 'string' ? h3.statusText : (typeof h3?.statusMessage === 'string' ? h3.statusMessage : '')
  if (status) return `${status}${text ? ` ${text}` : ''}`.slice(0, 80)
  return error instanceof Error ? error.name : 'unknown'
}

export function insightsLogAi(
  phase: 'requested' | 'completed' | 'failed',
  kind: InsightsAiKind,
  data: {
    postId: string
    format?: string
    model?: string
    promptVersion?: string
    durationMs?: number
    errorCode?: string
    /**
     * Wie lang der Brief GEWORDEN ist und wie lang die Antwort WAR. Zwei
     * Zahlen statt einer, weil nur ihr Unterschied zeigt, dass der Prompt
     * seinen eigenen Deckel reisst (gemessen am 2026-10-28: zwei von sechs
     * Läufen) — und das ist eine Sache des PROMPTS, nicht der Route.
     */
    briefChars?: number
    briefRawChars?: number
  },
): void {
  logEvent(phase === 'failed' ? 'warn' : 'info', `insights.${kind}.${phase}`, { ...data })
}
