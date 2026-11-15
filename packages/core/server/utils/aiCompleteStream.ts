import type { H3Event } from 'h3'
import type { AiCompleteOptions } from './aiComplete'
import { buildAiRequestBody, getAiConfig, resolveAiKey } from './aiComplete'
import { aiCallFailed, aiHttpFailure, aiLogLine, aiRunMs, assertAiRouteOnly, isAiTransportError, startAiRun } from './aiLog'

/**
 * DIE STREAMING-VARIANTE DER KI-NAHT (Plan BRAND-WIZARD-PHASE-1 §6: „eine
 * STREAMING-Variante der KI-Naht — eigene SSE-Route, gleiche Gates/Drosseln/
 * Override-Kette, keine Gateway-Abhängigkeit").
 *
 * Gates (`pukalani.ai.enabled`, `app_config.brandAiEnabled`), Drosseln und die
 * Validierung der Antwort gehören dem Konsumenten. Wie `aiComplete()` trägt
 * der Transport seit P17 die Datenschutz-Bindung selbst (über denselben
 * Request-Bau) und loggt nur Kennungen (`aiLog.ts`).
 *
 * ── DERSELBE REQUEST-BAU, EINE ZEILE ANDERS ───────────────────────────────
 * Der Body kommt aus `buildAiRequestBody({ …, stream: true })` — NICHT aus
 * einer zweiten Zusammenstellung. Das ist der Grund, warum jene Funktion
 * überhaupt exportiert ist (s. ihren Kopf): der Streaming-Pfad ist ausgerechnet
 * der Brand-Wizard, also der Pfad MIT den strengsten Datenschutz-Bedingungen
 * (`zdr`, `data_collection: 'deny'`, Anbieter-Allowlist, kein Fallback). Zwei
 * Bau-Stellen hiessen: irgendwann fehlt eines dieser Felder auf genau dem Weg,
 * auf dem es am meisten zählt. Der Beweis dafür ist ein Test, der den WIRKLICH
 * abgeschickten Body beider Pfade vergleicht.
 *
 * ── DER PARSER IST PUR UND CHUNK-GRENZEN-FEST ─────────────────────────────
 * `decodeSseChunk(buffer, chunk)` nimmt einen Puffer und ein Stück Text und
 * gibt den NEUEN Puffer plus die vollständig gelesenen Ereignisse zurück — kein
 * verstecktes `this`, kein Modul-Zustand. Ein Delta darf über zwei, drei oder
 * zwanzig Chunks zerrissen sein: verarbeitet wird nur, was durch eine
 * Leerzeile abgeschlossen ist, der Rest bleibt im Puffer. Genau deshalb ist der
 * Puffer ein WERT und kein Seiteneffekt — ein Test kann jede denkbare
 * Zerreissung nachstellen, ohne einen Server zu starten.
 *
 * ── WAS DER DEKODIERER IGNORIERT, IST ABSICHT ─────────────────────────────
 * Kommentar-Zeilen (`: OPENROUTER PROCESSING` — OpenRouters Keepalive),
 * `event:`/`id:`/`retry:`-Felder und unlesbares JSON werden ÜBERSPRUNGEN, nicht
 * zum Fehler erhoben. Ein Keepalive, der den Lauf abbricht, wäre ein
 * selbstgebauter Ausfall. Ein Anbieter-FEHLER kommt dagegen als eigenes Frame
 * (`data: {"error": …}`) und wird als `error`-Ereignis gemeldet — das ist der
 * Unterschied zwischen „nichts drin" und „es ging schief". Das Ereignis trägt
 * seit P17 nur die KENNUNG des Fehlers (`error.code`/`error.type`), nie seinen
 * Text: der kann die Anfrage zurückzitieren.
 */

const DEFAULT_STREAM_TIMEOUT_MS = 120_000

/** Token-Zahlen, soweit der Anbieter sie mitschickt. */
export interface AiStreamUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

/** Was in EINEM SSE-Frame stehen kann. */
export type AiStreamEvent
  = | { kind: 'delta', text: string }
    | { kind: 'meta', model: string, provider: string, id?: string }
    | { kind: 'usage', usage: AiStreamUsage }
    | { kind: 'error', tag: string }
    | { kind: 'done' }

export interface AiSseDecodeResult {
  /** Der unvollständige Rest — beim nächsten Aufruf wieder hineingeben. */
  buffer: string
  events: AiStreamEvent[]
}

/** `\r\n` (manche Anbieter) auf `\n` normalisieren — idempotent. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readUsage(raw: unknown): AiStreamUsage {
  const usage = (raw ?? {}) as Record<string, unknown>
  return {
    promptTokens: toNumberOrNull(usage.prompt_tokens),
    completionTokens: toNumberOrNull(usage.completion_tokens),
    totalTokens: toNumberOrNull(usage.total_tokens),
  }
}

const ERROR_TAG = /^[\w./:@-]{1,64}$/

/** Die Kennung eines Fehler-Frames (`code`, sonst `type`) — nie `message`. */
function readErrorTag(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    for (const key of ['code', 'type'] as const) {
      const value = (raw as Record<string, unknown>)[key]
      const tag = typeof value === 'number' && Number.isInteger(value) ? String(value) : value
      if (typeof tag === 'string' && ERROR_TAG.test(tag)) return tag
    }
  }
  return 'stream_error'
}

/**
 * EIN Frame (die Zeilen zwischen zwei Leerzeilen) → Ereignisse. Mehrere
 * `data:`-Zeilen eines Frames werden mit `\n` verbunden, so schreibt es SSE vor.
 */
export function decodeSseFrame(frame: string): AiStreamEvent[] {
  const dataLines: string[] = []
  for (const rawLine of normalizeNewlines(frame).split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue
    // Kommentar (Keepalive) und Nicht-`data`-Felder tragen nichts bei.
    if (line.startsWith(':') || !line.startsWith('data:')) continue
    dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
  }
  if (!dataLines.length) return []

  const payload = dataLines.join('\n')
  if (payload.trim() === '[DONE]') return [{ kind: 'done' }]

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  }
  catch {
    // Unlesbares JSON überspringen (s. Kopf) — nie den Lauf daran aufhängen.
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []

  const record = parsed as {
    error?: unknown
    id?: unknown
    model?: unknown
    provider?: unknown
    usage?: unknown
    choices?: { delta?: { content?: unknown }, message?: { content?: unknown } }[]
  }

  // Ein Fehler-Frame beendet die Auswertung: was danach im selben Frame stünde,
  // wäre bestenfalls Rauschen.
  if (record.error) return [{ kind: 'error', tag: readErrorTag(record.error) }]

  const events: AiStreamEvent[] = []
  const model = typeof record.model === 'string' ? record.model : ''
  const provider = typeof record.provider === 'string' ? record.provider : ''
  const id = typeof record.id === 'string' ? record.id : ''
  if (model || provider || id) events.push({ kind: 'meta', model, provider, ...(id ? { id } : {}) })

  const choice = record.choices?.[0]
  const content = choice?.delta?.content ?? choice?.message?.content
  if (typeof content === 'string' && content.length > 0) events.push({ kind: 'delta', text: content })

  if (record.usage) events.push({ kind: 'usage', usage: readUsage(record.usage) })

  return events
}

/**
 * DER PURE DEKODIERER. Verarbeitet AUSSCHLIESSLICH abgeschlossene Frames; der
 * unvollständige Rest wandert in den zurückgegebenen Puffer.
 */
export function decodeSseChunk(buffer: string, chunk: string): AiSseDecodeResult {
  const combined = normalizeNewlines(buffer + chunk)
  const frames = combined.split('\n\n')
  // Das letzte Stück ist per Definition unabgeschlossen (auch wenn es leer ist).
  const rest = frames.pop() ?? ''
  const events: AiStreamEvent[] = []
  for (const frame of frames) events.push(...decodeSseFrame(frame))
  return { buffer: rest, events }
}

/**
 * Was am STROM-ENDE noch im Puffer liegt. Anbieter, die das letzte Frame ohne
 * abschliessende Leerzeile senden, verlören sonst ihr `[DONE]` — oder, schlimmer,
 * das letzte Delta.
 */
export function decodeSseTail(buffer: string): AiStreamEvent[] {
  return buffer.trim() ? decodeSseFrame(buffer) : []
}

export interface AiCompleteStreamOptions extends AiCompleteOptions {
  /** Abbruch von aussen (der Mensch drückt „Stopp"). Beendet den Fetch. */
  signal?: AbortSignal
  /** Je Text-Delta genau einmal gerufen — hier hängt die SSE-Weitergabe dran. */
  onDelta?: (text: string) => void | Promise<void>
}

export interface AiCompleteStreamResult {
  /** Der vollständige Text aller Deltas. Bei Abbruch: was bis dahin ankam. */
  text: string
  usage: AiStreamUsage | null
  /** Was der Anbieter über sich gesagt hat; leer, wenn er nichts sagte. */
  model: string
  provider: string
  /** Der Lauf wurde von aussen abgebrochen — `text` ist dann unvollständig. */
  aborted: boolean
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/**
 * Streamt eine Completion. Wirft wie `aiComplete()` (503 ohne Schlüssel, 502 bei
 * Anbieter-Fehlern); ein ABBRUCH von aussen ist dagegen kein Fehler, sondern
 * ein Ergebnis mit `aborted: true` — der Aufrufer entscheidet dann selbst, ob er
 * verwirft (der Brand-Wizard tut genau das: „Abbruch lässt den bisherigen
 * Entwurf unangetastet", §3e).
 */
export async function aiCompleteStream(
  event: H3Event,
  prompt: string,
  options: AiCompleteStreamOptions = {},
): Promise<AiCompleteStreamResult> {
  const defaults = getAiConfig()
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  const apiKey = options.apiKey || await resolveAiKey(event)
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
  }
  const ctx = startAiRun(options.label ?? 'core', model)
  if (options.providerRouting?.only) assertAiRouteOnly(options.providerRouting.only, ctx)
  let status = 0
  let gen: string | undefined

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller)
  if (options.signal?.aborted) controller.abort()

  const result: AiCompleteStreamResult = {
    text: '',
    usage: null,
    model: '',
    provider: '',
    aborted: false,
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Ohne diesen Kopf antworten manche Zwischenschichten mit JSON statt
        // mit einem Strom — und der Parser sähe genau ein riesiges Frame.
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(buildAiRequestBody({
        model,
        prompt,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerRouting: options.providerRouting,
        stream: true,
      })),
    })

    status = res.status
    if (!res.ok) await aiHttpFailure(res, ctx, 'KI-Stream-API-Fehler')
    if (!res.body) {
      console.error(aiLogLine(ctx.label, 'KI-Stream ohne Rumpf', { status, model, ms: aiRunMs(ctx), run: ctx.run }))
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finished = false

    const consume = async (events: AiStreamEvent[]): Promise<boolean> => {
      for (const item of events) {
        if (item.kind === 'delta') {
          result.text += item.text
          if (options.onDelta) await options.onDelta(item.text)
        }
        else if (item.kind === 'meta') {
          if (item.model) result.model = item.model
          if (item.provider) result.provider = item.provider
          if (item.id) gen = item.id
        }
        else if (item.kind === 'usage') {
          result.usage = item.usage
        }
        else if (item.kind === 'error') {
          console.error(aiLogLine(ctx.label, 'KI-Stream-Fehlerframe', {
            status,
            tag: item.tag,
            model,
            ms: aiRunMs(ctx),
            chars: result.text.length,
            run: ctx.run,
            gen,
          }))
          throw createError({ status: 502, statusText: 'AI provider error' })
        }
        else {
          return true
        }
      }
      return false
    }

    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      const decoded = decodeSseChunk(buffer, decoder.decode(value, { stream: true }))
      buffer = decoded.buffer
      finished = await consume(decoded.events)
    }
    if (!finished) await consume(decodeSseTail(buffer))
  }
  catch (error) {
    if (isAbortError(error)) {
      if (timedOut) {
        console.error(aiLogLine(ctx.label, 'KI-Stream Zeitüberschreitung', { model, ms: aiRunMs(ctx), chars: result.text.length, run: ctx.run, gen }))
        throw createError({ status: 502, statusText: 'AI stream timed out' })
      }
      // Von aussen abgebrochen — ein Ergebnis, kein Fehler (s. Kopf).
      result.aborted = true
      return result
    }
    if (isAiTransportError(error)) throw error
    aiCallFailed(error, ctx, 'KI-Stream fehlgeschlagen', 'AI stream failed', { chars: result.text.length, gen })
  }
  finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }

  return result
}
