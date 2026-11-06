import type { H3Event } from 'h3'
import { type AiProviderRouting, aiProviderErrorTag } from './aiComplete'

/**
 * BILDER LESEN — der Vision-Transport des Core (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.12, DECISION-LOG 2026-09-08 „Vision/Bild über
 * OpenRouter mit ZDR-Filter").
 *
 * ── DIESELBE FAMILIE WIE `aiComplete`, EIN ANDERER NACHRICHTEN-TYP ────────
 * Es ist dieselbe OpenAI-kompatible Chat-Completions-API, derselbe Schlüssel
 * (`resolveAiKey`: Konsole vor Env) und dieselbe Antwort-Form. Der einzige
 * Unterschied ist der INHALT einer Nachricht: statt einer Zeichenkette reist
 * eine LISTE aus Text- und Bild-Teilen
 * (`[{type:'text'},{type:'image_url',image_url:{url:'data:…;base64,…'}}]`).
 *
 * Eine eigene Datei und keine Erweiterung von `aiComplete.ts`, aus zwei
 * Gründen: (1) `buildAiRequestBody` ist der EINE Request-Bau des Text-Weges
 * (auch für den Strom des Brand-Wizards) — ein optionales Bild-Feld darin
 * hiesse, dass jede Text-Änderung künftig am Bild-Pfad vorbeimuss. (2) Die
 * ZDR-Klemme unten gilt NUR hier und darf den Text-Weg nicht anfassen, dessen
 * Bedingungen die Konsumenten selbst setzen.
 *
 * ── DIE ZDR-KLEMME IST NICHT VERHANDELBAR ────────────────────────────────
 * Ein Vision-Aufruf schickt KUNDEN-SCREENSHOTS an einen fremden Anbieter.
 * Davids Entscheidung vom 2026-09-08: das darf nur unter der Bedingung
 * geschehen, dass der Anbieter den Inhalt nicht speichert und nicht darauf
 * trainiert. Umgesetzt über OpenRouters Provider-Routing
 * (https://openrouter.ai/docs/features/provider-routing): `provider.
 * data_collection = 'deny'` schliesst jeden Anbieter aus, der Prompts sammelt.
 *
 * Das Feld setzt DER TRANSPORT und nicht der Konsument, und es lässt sich von
 * aussen NICHT abschalten: `options.providerRouting` darf die Bedingungen nur
 * VERSCHÄRFEN (`zdr`, `only`, `allowFallbacks`) — ein übergebenes
 * `dataCollection: 'allow'` wird überschrieben. Ein Schalter dafür wäre ein
 * Schalter, den irgendwann jemand aus Versehen umlegt, und der Schaden
 * (fremde Screenshots im Trainingsdatensatz eines Anbieters) ist nicht
 * rückholbar. Wer andere Bedingungen braucht, ruft `aiComplete` — dort sind
 * sie ehrlich sichtbar Sache des Aufrufers.
 *
 * ── BILDER REISEN NIE INS LOG ─────────────────────────────────────────────
 * Weder der Prompt noch die Bytes noch ein data:-URI erscheinen in
 * `console.error` oder `logEvent`. Was geloggt wird, sind KENNZAHLEN: wie
 * viele Bilder und wie viele Bytes. Ein 5-MB-Base64-Block in einer Logzeile
 * wäre ausserdem allein durch seine Grösse ein Betriebsproblem.
 */

/** 45 s wie im Text-Weg; ein Bild-Aufruf ist langsamer, aber kein Strom. */
const DEFAULT_TIMEOUT_MS = 60_000

/** Bild-Aufrufe antworten strukturiert und kurz — mehr als das ist Geschwätz. */
const DEFAULT_MAX_TOKENS = 1500

/**
 * DIE EINGANGS-KLEMME DES TRANSPORTS (Audit-Befund 2026-09-09).
 *
 * ── WARUM DER TRANSPORT ÜBERHAUPT KLEMMT ──────────────────────────────────
 * Bis hierher prüfte `aiVision` nur `images.length === 0`. Nach oben stand
 * nichts: ein Konsument, der versehentlich eine ungeklemmte Liste reicht,
 * baute einen Body aus beliebig vielen base64-Blöcken und schickte ihn ab —
 * der Speicher geht beim `JSON.stringify` drauf, der Anbieter antwortet nach
 * einer Minute mit einer 413, und bezahlt ist der Versuch trotzdem. Eine
 * Sicherung gehört deshalb in die SCHNITTSTELLE und nicht in die Disziplin
 * der Aufrufer (dieselbe Lehre wie bei der Index-Fabrik der Migrationen).
 *
 * ── ZWEI DECKEL, ZWEI ORTE ────────────────────────────────────────────────
 * Das hier ist die TRANSPORT-Sicherung, nicht der Produkt-Deckel. Der Produkt-
 * Deckel bleibt beim Konsumenten (`brandInspirationReading.ts`: 12 Bilder à
 * 5 MB = 60 MB) und ist damit ENGER als diese Zahlen — genau so soll es sein:
 * ein Produkt sagt, was es zumutet, der Transport sagt, was er überhaupt noch
 * abschickt. Hier zu klemmen, was das Produkt erlaubt, hiesse zwei Wahrheiten
 * über dieselbe Zahl zu führen.
 *
 * Geworfen wird VOR jedem Netzaufruf — eine Anfrage, die der Transport selbst
 * für zu gross hält, darf einen Anbieter nicht erreichen.
 */
export const AI_VISION_MAX_IMAGES = 16

/** Summe ALLER Bild-Bytes eines Zuges (base64 bläht sie danach um ⅓ auf). */
export const AI_VISION_MAX_BYTES = 64_000_000

export interface AiVisionConfig {
  /** `false` = kein Vision-Modell konfiguriert (Core-Default). */
  enabled: boolean
  /** `pukalani.ai.visionModel` — leer heisst aus. */
  model: string
  baseUrl: string
}

/**
 * EIN BILD, wie der Transport es nimmt: die BYTES und ihr echter Typ.
 *
 * Der MIME-Typ ist ABSICHTLICH ein Pflichtfeld und wird hier nicht geraten:
 * der Aufrufer hat die Bytes und weiss (über Magic-Bytes, s.
 * `brandInspiration.ts`), was sie sind. Ein Transport, der selbst schnüffelt,
 * hätte eine zweite Wahrheit neben der des Konsumenten.
 *
 * `label` steht als eigener Text-Teil VOR dem Bild im selben Zug — so kann der
 * Prompt „Bild 3" sagen und das Modell weiss, welches gemeint ist. Ohne
 * Beschriftung sind mehrere Bilder in einer Nachricht eine ungeordnete Menge.
 */
export interface AiVisionImage {
  readonly mime: string
  readonly bytes: Uint8Array
  readonly label?: string
}

export interface AiVisionOptions {
  /** Model-Override — Default: `pukalani.ai.visionModel`. */
  model?: string
  baseUrl?: string
  /** Layer-eigener Key — Default: `resolveAiKey()` (Konsole vor NUXT_AI_KEY). */
  apiKey?: string
  system?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Log-Präfix des Aufrufers — Fehler bleiben zuordenbar. */
  label?: string
  /**
   * ZUSÄTZLICHE Bedingungen (`zdr`, `only`, `allowFallbacks`). Sie
   * VERSCHÄRFEN nur: `dataCollection` setzt der Transport selbst auf `'deny'`
   * und lässt sich nicht überschreiben (s. Kopf).
   */
  providerRouting?: AiProviderRouting
}

export interface AiVisionRequestBodyInput {
  model: string
  prompt: string
  images: readonly AiVisionImage[]
  system?: string
  temperature?: number
  maxTokens?: number
  providerRouting?: AiProviderRouting
}

/** Ein `data:`-URI aus Bytes — die einzige Form, die die API für Bilder kennt. */
export function aiVisionImageUrl(image: AiVisionImage): string {
  return `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`
}

type VisionContentPart =
  | { type: 'text', text: string }
  | { type: 'image_url', image_url: { url: string } }

/**
 * DER REQUEST-BAU — exportiert und ohne H3Event/fetch, damit der Beweis den
 * tatsächlich abgeschickten Body lesen kann und nicht den Aufruf.
 *
 * Reihenfolge im Zug: erst der PROMPT, dann je Bild seine Beschriftung und das
 * Bild selbst. Der Prompt zuerst, weil er die Aufgabe stellt — ein Modell, das
 * zwölf Bilder sieht und erst danach erfährt, wonach es schauen soll, arbeitet
 * schlechter.
 */
export function buildAiVisionRequestBody(
  input: AiVisionRequestBodyInput,
): Record<string, unknown> {
  const content: VisionContentPart[] = [{ type: 'text', text: input.prompt }]
  for (const image of input.images) {
    if (image.label) content.push({ type: 'text', text: image.label })
    content.push({ type: 'image_url', image_url: { url: aiVisionImageUrl(image) } })
  }

  /**
   * DIE KLEMME. `data_collection` steht ZULETZT im Objekt und wird deshalb
   * auch dann gesetzt, wenn der Aufrufer etwas anderes übergeben hat — die
   * Reihenfolge ist hier die Durchsetzung, nicht Kosmetik.
   */
  const routing = input.providerRouting
  const provider: Record<string, unknown> = {}
  if (routing?.zdr !== undefined) provider.zdr = routing.zdr
  if (routing?.only !== undefined) provider.only = [...routing.only]
  if (routing?.allowFallbacks !== undefined) provider.allow_fallbacks = routing.allowFallbacks
  provider.data_collection = 'deny'

  return {
    model: input.model,
    messages: [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content },
    ],
    temperature: input.temperature ?? 0,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    provider,
  }
}

/**
 * DAS VISION-GATE (Core-Default AUS): `pukalani.ai.visionModel`, leer.
 *
 * ── WARUM `pukalani.ai.enabled` NICHT MITZÄHLT ───────────────────────────
 * Der Schalter gehört den TEXT-Konsumenten des Core (Ticket-Triage,
 * Moderations-Assist) und steht in keiner App an, die heute Bilder lesen will:
 * `apps/branding` fährt seinen KI-Weg über den eigenen Kill-Switch
 * (`app_config.brandAiEnabled`) und eigene Modell-Schlüssel, ohne
 * `pukalani.ai.enabled` je zu setzen. Ein zusätzliches Und hier hiesse: das
 * Vision-Modell steht konfiguriert da und wirkt trotzdem nicht — ein Gate,
 * dessen Ausschalt-Grund man nirgends sieht.
 *
 * Der EIGENE Ausschalter ist deshalb der Modell-Name selbst. Er ist per
 * Default leer, also ist Vision überall aus, bis jemand ein Modell einträgt —
 * genau die Zusage „Core-Default aus", nur an dem Schlüssel, der auch die
 * Entscheidung trägt (dieselbe Bauform wie `pukalani.brand.ai.reviewModel`).
 */
export function getAiVisionConfig(): AiVisionConfig {
  const appConfig = useAppConfig() as {
    pukalani?: { ai?: { visionModel?: unknown, baseUrl?: unknown } }
  }
  const ai = appConfig.pukalani?.ai
  const model = typeof ai?.visionModel === 'string' ? ai.visionModel.trim() : ''
  const baseUrl = typeof ai?.baseUrl === 'string' && ai.baseUrl
    ? ai.baseUrl
    : 'https://openrouter.ai/api/v1'
  return { enabled: model.length > 0, model, baseUrl: baseUrl.replace(/\/$/, '') }
}

export interface EffectiveAiVisionConfig extends AiVisionConfig {
  /** Build-Default aus `pukalani.ai.visionModel` — für UI-Platzhalter. */
  defaultModel: string
}

/**
 * Effektive Vision-Config inkl. LAUFZEIT-OVERRIDE `app_config.aiVisionModel`
 * — dieselbe Bauform wie `getEffectiveAiConfig` für das Text-Modell.
 *
 * ── OHNE MIGRATION, UND DAS IST KEIN VERSEHEN ────────────────────────────
 * Die Spalte gibt es (noch) nirgends. Eine Appwrite-Zeile liefert nicht
 * angelegte Felder schlicht als `undefined`, also gilt dann der Build-Default
 * — der Override ist damit VORBEREITET, ohne dass ein Deploy auf ein Schema
 * warten muss. Wer ihn bedienen will, legt die Spalte an; der Code hier ändert
 * sich dabei nicht.
 *
 * Best-effort wie beim Text-Modell: ein Lesefehler ist kein Fehler, sondern
 * der Build-Default.
 */
export async function getEffectiveAiVisionConfig(
  event: H3Event,
): Promise<EffectiveAiVisionConfig> {
  const base = getAiVisionConfig()
  const config: EffectiveAiVisionConfig = { ...base, defaultModel: base.model }
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<
      import('node-appwrite').Models.Row & { aiVisionModel?: string }
    >({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    if (typeof row.aiVisionModel === 'string' && row.aiVisionModel.trim()) {
      config.model = row.aiVisionModel.trim()
      config.enabled = true
    }
  }
  catch { /* Override nicht lesbar → Build-Default */ }
  return config
}

/**
 * Ist der Vision-Pfad nutzbar (Modell konfiguriert UND Schlüssel vorhanden)?
 *
 * ASYNC wie `isAiConfigured`, und aus demselben Grund: der Schlüssel kann aus
 * der Datenbank kommen. Ein vergessenes `await` an einem `if (!isAi…)` wäre
 * kein Typfehler (ein Promise ist truthy), sondern ein still fail-open
 * geöffnetes Gate — der Name macht das Warten sichtbar.
 */
export async function isAiVisionConfigured(event: H3Event): Promise<boolean> {
  const config = await getEffectiveAiVisionConfig(event)
  if (!config.enabled) return false
  return Boolean(await resolveAiKey(event))
}

/**
 * BILDER LESEN. Wirft 503, wenn kein Modell oder kein Schlüssel da ist — der
 * Konsument prüft das über `isAiVisionConfigured()` VOR dem Aufruf und macht
 * daraus seinen eigenen, ruhigen Satz.
 */
export async function aiVision(
  event: H3Event,
  images: readonly AiVisionImage[],
  prompt: string,
  options: AiVisionOptions = {},
): Promise<string> {
  /**
   * Das Modell darf explizit übergeben werden, sonst gilt die EFFEKTIVE
   * Config — dieselbe Quelle, die `isAiVisionConfigured()` liest.
   *
   * Vorher stand hier `getAiVisionConfig()` (der Build-Default), während das
   * GATE eine Zeile weiter oben schon die effektive Config befragte: mit einem
   * Laufzeit-Override in `app_config` sagte das Gate „ja" und der Aufruf lief
   * ins leere Build-Modell — also 503 trotz konfigurierter Instanz
   * (Audit-Befund 2026-09-09). Mit `options.model` fragt hier NIEMAND die
   * Datenbank: der Aufrufer hat seine Wahl schon getroffen, und die `baseUrl`
   * ist in beiden Fassungen dieselbe.
   */
  const defaults = options.model ? getAiVisionConfig() : await getEffectiveAiVisionConfig(event)
  const label = options.label ?? 'core'
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  if (!model) {
    throw createError({ status: 503, statusText: 'AI vision not configured' })
  }
  const apiKey = options.apiKey || await resolveAiKey(event)
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
  }
  if (images.length === 0) {
    throw createError({ status: 400, statusText: 'AI vision needs at least one image' })
  }

  // Nur KENNZAHLEN — nie die Bytes, nie den Prompt (s. Kopf).
  const totalBytes = images.reduce((sum, image) => sum + image.bytes.length, 0)

  // Die Transport-Klemme, VOR dem Netzaufruf (s. `AI_VISION_MAX_IMAGES`).
  if (images.length > AI_VISION_MAX_IMAGES) {
    console.error(`[${label}] KI-Vision abgewiesen: ${images.length} Bilder (max ${AI_VISION_MAX_IMAGES})`)
    throw createError({ status: 413, statusText: 'AI vision got too many images' })
  }
  if (totalBytes > AI_VISION_MAX_BYTES) {
    console.error(`[${label}] KI-Vision abgewiesen: ${totalBytes} Bytes (max ${AI_VISION_MAX_BYTES})`)
    throw createError({ status: 413, statusText: 'AI vision got too many bytes' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAiVisionRequestBody({
        model,
        prompt,
        images,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerRouting: options.providerRouting,
      })),
    })
    if (!res.ok) {
      // STATUS UND KENNUNG, NIE DER RUMPF: ein Fehler-Rumpf zitiert je nach
      // Anbieter Teile der Anfrage zurück — hier also Kunden-Bilder
      // (`aiProviderErrorTag`, Audit-Befund 2026-09-09).
      console.error(
        `[${label}] KI-Vision-API ${res.status}${aiProviderErrorTag(await res.text())} `
        + `(${images.length} Bilder, ${totalBytes} Bytes)`,
      )
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }
    const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
    return payload.choices?.[0]?.message?.content ?? ''
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error(
      `[${label}] KI-Vision fehlgeschlagen (${images.length} Bilder, ${totalBytes} Bytes):`,
      error instanceof Error ? error.message : 'unknown',
    )
    throw createError({ status: 502, statusText: 'AI vision failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * Vision mit JSON-Antwort — dieselben Regeln wie `aiCompleteJson`: defensiv
 * auf das äussere Objekt zuschneiden (`extractJsonObject`), parsen, und die
 * FELDER klemmt der Aufrufer. `T` ist eine Behauptung, kein Beweis.
 *
 * Die ROHE Antwort steht bewusst NICHT im Log: sie beschreibt Kunden-Bilder.
 * Was zur Diagnose bleibt, ist die Länge.
 */
export async function aiVisionJson<T = unknown>(
  event: H3Event,
  images: readonly AiVisionImage[],
  prompt: string,
  options: AiVisionOptions = {},
): Promise<T> {
  const raw = await aiVision(event, images, prompt, options)
  try {
    return JSON.parse(extractJsonObject(raw)) as T
  }
  catch {
    console.error(
      `[${options.label ?? 'core'}] KI-Vision-Antwort war kein JSON (${raw.length} Zeichen)`,
    )
    throw createError({ status: 502, statusText: 'AI returned no JSON' })
  }
}
