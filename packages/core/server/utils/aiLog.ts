import { randomUUID } from 'node:crypto'
import { AI_ENDPOINT_UNAVAILABLE_CODE } from '../../shared/aiProviderRouting'
import { logEvent } from './logEvent'
import { softFail } from './softFail'

/**
 * DAS PROTOKOLL DER KI-TRANSPORTE — NUR KENNUNGEN (P17, SEC-017, 2026-11-15).
 *
 * Ein Fehler-Rumpf des Anbieters zitiert je nach Anbieter die Anfrage zurück,
 * ein Antworttext IST Kundeninhalt, und ein Fehlerobjekt trägt in `message`
 * gern einen Ausschnitt davon (ein `SyntaxError` aus `res.json()` zitiert die
 * Antwort). Nichts davon gehört ins Log. Was eine Diagnose wirklich braucht:
 * Art, HTTP-Status, Kennung des Anbieters, Modell, Dauer, Längen, Tokenzahlen
 * und eine Lauf-Kennung, die alle Zeilen EINES Aufrufs verbindet.
 *
 * `aiLogLine` nimmt dafür nur Zahlen und kurze Kennungen an — jeder Feldwert,
 * der keine ist, wird zu `?`. So kann STRUKTURELL kein Fliesstext in die
 * Zeile, auch nicht durch eine künftige Aufrufstelle. Einen Schalter, der den
 * Rumpf wieder einschaltet, gibt es bewusst nicht.
 */

/** Die festen Arten einer Zeile — eine Aufrufstelle kann keinen freien Text übergeben. */
export type AiLogWhat
  = | 'KI-API-Fehler'
    | 'KI-Stream-API-Fehler'
    | 'KI-Bild-API-Fehler'
    | 'KI-Vision-API-Fehler'
    | 'KI-Video-API-Fehler'
    | 'KI-Aufruf fehlgeschlagen'
    | 'KI-Stream fehlgeschlagen'
    | 'KI-Bild fehlgeschlagen'
    | 'KI-Vision fehlgeschlagen'
    | 'KI-Video fehlgeschlagen'
    | 'KI-Routing ungültig'
    | 'KI-Antwort ohne JSON'
    | 'KI-Antwort abgeschnitten'
    | 'KI-Antwort erst nach Reparatur JSON'
    | 'KI-Stream-Fehlerframe'
    | 'KI-Stream ohne Rumpf'
    | 'KI-Stream Zeitüberschreitung'
    | 'KI-Vision abgewiesen'
    | 'KI-Video abgewiesen'
    | 'KI abgeschaltet'

export type AiLogFields = Readonly<Record<string, string | number | undefined>>

const SAFE_VALUE = /^[\w./:@-]{1,80}$/

/**
 * DIE EINE FILTERREGEL für jeden Wert, der ins KI-Protokoll geht — Textzeile
 * (`aiLogLine`) und JSON-Zeile (`logAiFailed`/`logAiDisabled`) teilen sie:
 * eine endliche Zahl oder eine kurze Kennung, sonst `?`.
 */
export function aiLogSafeValue(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '?'
  return SAFE_VALUE.test(value) ? value : '?'
}

/** `[label] Art feld=wert …` — `undefined` fällt weg, alles Unsichere wird `?`. */
export function aiLogLine(label: string, what: AiLogWhat, fields: AiLogFields): string {
  const parts = [`[${aiLogSafeValue(label)}] ${what}`]
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    parts.push(`${key}=${aiLogSafeValue(value)}`)
  }
  return parts.join(' ')
}

/**
 * Die Art eines echten Ausfalls eines bezahlten Aufrufs: `http` = der
 * Vermittler antwortete mit einem Fehler-Status, `call` = der Aufruf selbst
 * scheiterte (Netz, Abbruch, unlesbare Antwort), `stream` = der Stream kam
 * ohne Rumpf, mit Fehlerframe oder lief in die Zeitüberschreitung.
 */
export type AiFailureKind = 'http' | 'call' | 'stream'

/**
 * EINE zählbare JSON-Zeile je echtem Ausfall (OPS-011, seit 2026-11-16): der
 * tägliche Wächter zählt `ai.failed` in den pm2-Logs; die Textzeile daneben
 * bleibt für den Menschen. NUR Kennungen, gefiltert wie `aiLogLine` — kein
 * Rumpf, keine Nachricht. Bewusst NICHT für abgewiesene Eingaben (vor dem
 * Senden, nichts bezahlt), Qualitäts-Zeilen (abgeschnitten, ohne JSON) und
 * „Routing ungültig" (ein Programmierfehler, eigener Fall).
 */
export function logAiFailed(ctx: AiRunContext, kind: AiFailureKind, status?: number): void {
  logEvent('error', 'ai.failed', {
    label: aiLogSafeValue(ctx.label),
    kind,
    ...(status === undefined ? {} : { status: Number.isFinite(status) ? status : 0 }),
    model: aiLogSafeValue(ctx.model),
    run: aiLogSafeValue(ctx.run),
  })
}

/**
 * KI1 (d): WAS EIN ERFOLGREICHER LAUF GEKOSTET HAT, und bei wem (2026-11-25).
 *
 * Bis hierher stand ein bezahlter Lauf nur im Log, wenn er SCHEITERTE. Wer
 * wissen wollte, was eine Route im Betrieb kostet oder welcher Anbieter unter
 * der Europa-Bindung wirklich gerechnet hat, musste beim Vermittler
 * nachsehen. Jetzt schreibt jeder erfolgreiche Text-Lauf (auch der Stream)
 * EINE zählbare `info`-Zeile `ai.completed`: Kennungen und Zahlen, wie
 * `ai.failed` — kein Text, kein Prompt.
 *
 * `costUsd` ist der Betrag, den der Vermittler in `usage.cost` meldet
 * (OpenRouter schickt ihn mit, in US-Dollar). Fehlt er, fehlt das Feld —
 * geschätzt wird nicht. `provider` ist der Anbieter, den der Vermittler
 * nennt („Amazon Bedrock" ⇒ `amazon-bedrock`).
 */
export interface AiCompletedFields {
  provider?: string
  promptTokens?: number | null
  completionTokens?: number | null
  costUsd?: number | null
}

/** „Amazon Bedrock" ⇒ `amazon-bedrock`; leer oder nichts Lesbares ⇒ `undefined`. */
export function aiProviderSlug(provider: unknown): string | undefined {
  if (typeof provider !== 'string') return undefined
  const slug = provider.trim().toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.length > 0 && slug.length <= 64 ? slug : undefined
}

/** `usage.cost` des Vermittlers — nur eine endliche Zahl ab 0, sonst `null`. */
export function aiUsageCost(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') return null
  const cost = (usage as { cost?: unknown }).cost
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function logAiCompleted(ctx: AiRunContext, fields: AiCompletedFields): void {
  const costUsd = finiteOrUndefined(fields.costUsd)
  logEvent('info', 'ai.completed', {
    label: aiLogSafeValue(ctx.label),
    model: aiLogSafeValue(ctx.model),
    run: aiLogSafeValue(ctx.run),
    ms: aiRunMs(ctx),
    provider: fields.provider === undefined ? undefined : aiLogSafeValue(fields.provider),
    tokensIn: finiteOrUndefined(fields.promptTokens),
    tokensOut: finiteOrUndefined(fields.completionTokens),
    // Auf Millionstel gerundet: mehr Stellen meldet kein Vermittler sinnvoll.
    costUsd: costUsd === undefined ? undefined : Math.round(costUsd * 1e6) / 1e6,
  })
}

/** Der Abschalter hat einen Aufruf verhindert — eine `warn`-Zeile, zählbar wie `ai.failed`. */
export function logAiDisabled(label: string, model: string | undefined, run: string | undefined): void {
  logEvent('warn', 'ai.disabled', {
    label: aiLogSafeValue(label),
    model: model === undefined ? undefined : aiLogSafeValue(model),
    run: run === undefined ? undefined : aiLogSafeValue(run),
  })
}

/** Eine kurze Kennung je Transport-Aufruf (`run=`). */
export function newAiRunId(): string {
  return randomUUID().slice(0, 8)
}

/**
 * Die Kennung des Anbieters aus einem Fehler-Rumpf (`error.code`/`error.type`),
 * NIE `message`. Zahlen zählen nicht (der HTTP-Status steht ohnehin in der
 * Zeile), zu lange Werte auch nicht. Kein JSON, keine Kennung ⇒ `undefined`.
 */
export function aiProviderErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown, type?: unknown } }
    const code = typeof parsed.error?.code === 'string' ? parsed.error.code : ''
    const type = typeof parsed.error?.type === 'string' ? parsed.error.type : ''
    const parts = [code, type].filter(part => part.length > 0 && part.length <= 64)
    return parts.length > 0 ? parts.join('/') : undefined
  }
  catch {
    return undefined
  }
}

/** Was von einem geworfenen Objekt ins Log darf: der Name und ein kurzer `cause.code`. */
export function aiThrowableFields(error: unknown): { err: string, cause?: string } {
  if (!(error instanceof Error)) return { err: 'unknown' }
  const cause = (error as { cause?: unknown }).cause
  const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : undefined
  return typeof code === 'string' ? { err: error.name, cause: code } : { err: error.name }
}

/** Ein bereits gebauter HTTP-Fehler (unser `createError`) — reicht der Transport unverändert durch. */
export function isAiTransportError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return 'statusCode' in error || typeof (error as { status?: unknown }).status === 'number'
}

/** 503: unter der Bindung ist kein Endpunkt erreichbar — kein Ausweichen auf ein anderes Modell. */
export function aiEndpointUnavailableError() {
  return createError({
    status: 503,
    statusText: 'AI model unavailable under data routing',
    data: { code: AI_ENDPOINT_UNAVAILABLE_CODE },
  })
}

/** Für Routen, die einen KI-Fehler sonst durch einen eigenen ersetzen würden. */
export function isAiEndpointUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { data?: { code?: unknown } }).data?.code === AI_ENDPOINT_UNAVAILABLE_CODE
}

/** 500: eine leere oder fehlende Ortsliste — es geht nichts raus, auch kein Rückfall. */
export function aiRoutingInvalidError() {
  return createError({ status: 500, statusText: 'AI routing invalid' })
}

/** Was jede Zeile eines Aufrufs gemeinsam hat. */
export interface AiRunContext {
  readonly label: string
  readonly model: string
  readonly run: string
  readonly started: number
}

export function startAiRun(label: string, model: string): AiRunContext {
  return { label, model, run: newAiRunId(), started: Date.now() }
}

export function aiRunMs(ctx: AiRunContext): number {
  return Date.now() - ctx.started
}

/** Prüft die Ortsliste VOR dem Senden; leer oder fehlend ⇒ Zeile ohne Inhalt, dann 500. */
export function assertAiRouteOnly(only: readonly string[] | undefined, ctx: AiRunContext): void {
  if (only && only.length > 0) return
  console.error(aiLogLine(ctx.label, 'KI-Routing ungültig', { model: ctx.model, run: ctx.run }))
  throw aiRoutingInvalidError()
}

/**
 * Ein `!res.ok` des Vermittlers: Kennung statt Rumpf ins Log, dann 503 bei
 * 404 („kein Endpunkt unter der Bindung"), sonst 502.
 */
export async function aiHttpFailure(
  res: { status: number, text: () => Promise<string> },
  ctx: AiRunContext,
  what: AiLogWhat,
  extra: AiLogFields = {},
): Promise<never> {
  const body = await res.text().catch(softFail('core:utils/aiLog:text', ''))
  console.error(aiLogLine(ctx.label, what, {
    status: res.status,
    tag: aiProviderErrorCode(body),
    model: ctx.model,
    ms: aiRunMs(ctx),
    ...extra,
    run: ctx.run,
  }))
  logAiFailed(ctx, 'http', res.status)
  if (res.status === 404) throw aiEndpointUnavailableError()
  throw createError({ status: 502, statusText: 'AI provider unavailable' })
}

/** Der `catch` eines Transports: eigene HTTP-Fehler durch, alles andere als Name + 502. */
export function aiCallFailed(
  error: unknown,
  ctx: AiRunContext,
  what: AiLogWhat,
  statusText: string,
  extra: AiLogFields = {},
): never {
  if (isAiTransportError(error)) throw error
  console.error(aiLogLine(ctx.label, what, {
    ...aiThrowableFields(error),
    model: ctx.model,
    ms: aiRunMs(ctx),
    ...extra,
    run: ctx.run,
  }))
  logAiFailed(ctx, 'call')
  throw createError({ status: 502, statusText })
}
