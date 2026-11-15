import { randomUUID } from 'node:crypto'
import { AI_ENDPOINT_UNAVAILABLE_CODE } from '../../shared/aiProviderRouting'

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

function safeValue(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '?'
  return SAFE_VALUE.test(value) ? value : '?'
}

/** `[label] Art feld=wert …` — `undefined` fällt weg, alles Unsichere wird `?`. */
export function aiLogLine(label: string, what: AiLogWhat, fields: AiLogFields): string {
  const parts = [`[${SAFE_VALUE.test(label) ? label : '?'}] ${what}`]
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    parts.push(`${key}=${safeValue(value)}`)
  }
  return parts.join(' ')
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
  const body = await res.text().catch(() => '')
  console.error(aiLogLine(ctx.label, what, {
    status: res.status,
    tag: aiProviderErrorCode(body),
    model: ctx.model,
    ms: aiRunMs(ctx),
    ...extra,
    run: ctx.run,
  }))
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
  throw createError({ status: 502, statusText })
}
