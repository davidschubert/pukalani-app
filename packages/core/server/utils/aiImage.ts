import type { H3Event } from 'h3'
import { type AiProviderRouting, aiProviderErrorTag } from './aiComplete'

/**
 * BILDER ERZEUGEN — der Bild-Transport des Core (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.12, Paket D5c; DECISION-LOG 2026-09-08
 * „Bild-Modell `google/gemini-2.5-flash-image-preview`, ZDR fest").
 *
 * ── DRITTE DATEI DERSELBEN FAMILIE ────────────────────────────────────────
 * `aiComplete` schickt Text und bekommt Text, `aiVision` schickt Bilder und
 * bekommt Text, hier gehen Text hinein und BILDER heraus. Derselbe Schlüssel
 * (`resolveAiKey`: Konsole vor Env), dieselbe Basis-URL, dieselbe
 * Chat-Completions-Adresse — und aus denselben zwei Gründen wie bei `aiVision`
 * eine eigene Datei: `buildAiRequestBody` ist der EINE Request-Bau des
 * Text-Weges (auch für den Strom des Brand-Wizards), und die ZDR-Klemme unten
 * gilt NUR hier.
 *
 * ── WARUM `/chat/completions` UND NICHT DER BILD-ENDPUNKT ────────────────
 * OpenRouter hat BEIDE Wege, und die Wahl hier ist keine Gewohnheit, sondern
 * die einzige, die Davids Bedingung einhält:
 *
 *  · `POST /images` ist der dedizierte Bild-Endpunkt (`model` + `prompt`,
 *    Antwort `data[].b64_json`). Sein Routing-Objekt heisst im OpenAPI-Schema
 *    `ImageGenerationProviderPreferences` und kennt **`allow_fallbacks`,
 *    `ignore`, `only`, `options`, `order`, `sort` — kein `data_collection`
 *    und kein `zdr`** (geprüft am Schema unter
 *    https://openrouter.ai/docs/api/api-reference/images/generate-an-image.md,
 *    2026-09-08). Dort liesse sich die Datenschutz-Bedingung also gar nicht
 *    stellen.
 *  · `POST /chat/completions` nimmt `modalities: ['image','text']`
 *    („Output modalities for the response. Supported values are 'text',
 *    'image', and 'audio'") und liefert die Bilder in
 *    `choices[].message.images[].image_url.url` als `data:image/png;base64,…`
 *    (Schema `ChatAssistantImages`: „Generated images from image generation
 *    models"). Sein Provider-Objekt trägt `data_collection` mit den Werten
 *    `allow` (Default) und `deny` — „use only providers which do not collect
 *    user data".
 *
 * Ein Bild-Endpunkt ohne die Klemme wäre bequemer und genau das, wogegen die
 * Entscheidung geschrieben ist. Wer ihn später doch braucht (mehrere Bilder je
 * Aufruf über `n`, Seitenverhältnisse), baut ihn NEBEN diese Datei und schreibt
 * dazu, unter welcher Bedingung das erlaubt sein soll.
 *
 * ── DIE ZDR-KLEMME IST NICHT VERHANDELBAR ────────────────────────────────
 * Wörtlich wie in `aiVision.ts`: `provider.data_collection = 'deny'` setzt DER
 * TRANSPORT, steht ZULETZT im Objekt und lässt sich von aussen nur
 * VERSCHÄRFEN (`zdr`, `only`, `allowFallbacks`). Ein übergebenes
 * `dataCollection: 'allow'` wird überschrieben. Ein Schalter dafür wäre ein
 * Schalter, den irgendwann jemand umlegt, und ein Prompt, der die Marke,
 * die Farbwelt und das Briefing eines Kunden trägt, ist im Trainingsdatensatz
 * eines Anbieters nicht mehr einzusammeln.
 *
 * ── BILDER REISEN NIE INS LOG ─────────────────────────────────────────────
 * Weder der Prompt noch die Bytes noch ein `data:`-URI erscheinen in
 * `console.error` oder `logEvent`. Geloggt werden KENNZAHLEN: wie viele Bilder
 * und wie viele Bytes. Ein 2-MB-Base64-Block in einer Logzeile wäre ausserdem
 * allein durch seine Grösse ein Betriebsproblem.
 *
 * ── DIE ANTWORT WIRD GEKLEMMT, NICHT GEGLAUBT ────────────────────────────
 * Was zurückkommt, ist eine Zeichenkette von einem fremden Anbieter. Sie geht
 * durch `clampAiImages`: nur `data:`-URIs, nur PNG/JPEG/WebP, je Bild höchstens
 * 2 MB, höchstens vier Stück. Alles andere fällt weg — der Aufrufer legt diese
 * Bytes in einen Bucket und liefert sie später an einen Browser aus.
 */

/** Ein Bildlauf ist langsamer als ein Textlauf — 120 s statt 60. */
const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Der Token-Deckel. Bild-Modelle rechnen ihre Ausgabe in Tokens ab (ein Bild
 * sind grob 1000–4000); knapper gesetzt käme ein abgeschnittenes Bild zurück.
 */
const DEFAULT_MAX_TOKENS = 8000

/**
 * WIE VIELE BILDER EIN AUFRUF HÖCHSTENS LIEFERT.
 *
 * Vier, weil §2.5 Stufe 3 vier Entwürfe zusagt — und weil die Zahl HIER die
 * Klemme ist: ein Modell, das zwanzig Bilder zurückgibt, füllt sonst zwanzig
 * Bucket-Dateien, die niemand bestellt hat.
 */
export const AI_IMAGE_MAX_IMAGES = 4

/**
 * 2 MB je Bild — dieselbe Zahl wie `maximumFileSize` des Buckets
 * `brand-drafts` (Migration brand-023). Läge sie hier höher, käme ein Bild
 * durch den Transport und würde vom Speicher abgewiesen.
 */
export const AI_IMAGE_MAX_BYTES = 2_000_000

/** Die drei Formate, die wir annehmen — dieselbe Menge wie im Bucket. */
const ALLOWED_IMAGE_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

export interface AiImageConfig {
  /** `false` = kein Bild-Modell konfiguriert (Core-Default). */
  enabled: boolean
  /** `pukalani.ai.imageModel` — leer heisst aus. */
  model: string
  baseUrl: string
}

/** EIN erzeugtes Bild: die BYTES und ihr belegter Typ. */
export interface AiImageResult {
  readonly mime: string
  readonly bytes: Uint8Array
}

export interface AiImageOptions {
  /** Model-Override — Default: `pukalani.ai.imageModel`. */
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

export interface AiImageRequestBodyInput {
  model: string
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  providerRouting?: AiProviderRouting
}

/**
 * DER REQUEST-BAU — exportiert und ohne H3Event/fetch, damit der Beweis den
 * tatsächlich abgeschickten Body lesen kann und nicht den Aufruf.
 *
 * `modalities: ['image','text']` ist das eine Feld, das diesen Aufruf von
 * einem Text-Aufruf unterscheidet (s. Kopf). `'text'` steht mit drin, weil
 * die Modelle neben dem Bild eine kurze Beschreibung schicken — sie wird
 * verworfen, aber ein Modell, dem man den Textkanal nimmt, antwortet je nach
 * Anbieter gar nicht.
 */
export function buildAiImageRequestBody(
  input: AiImageRequestBodyInput,
): Record<string, unknown> {
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
    modalities: ['image', 'text'],
    messages: [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ],
    temperature: input.temperature ?? 1,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    provider,
  }
}

/**
 * EIN `data:`-URI ZURÜCK IN BYTES — oder `null`.
 *
 * FAIL-CLOSED an drei Stellen: kein `data:`-URI (etwa eine `https://`-Adresse,
 * die manche Anbieter schicken), ein Typ ausserhalb der drei erlaubten, oder
 * ein Base64-Block, der sich nicht dekodieren lässt. Eine HTTP-Adresse hier zu
 * FOLGEN wäre ein Nachladen aus einer Quelle, die die Antwort selbst benannt
 * hat — genau die Bauform, die man nicht will.
 */
export function parseAiImageDataUrl(value: unknown): AiImageResult | null {
  if (typeof value !== 'string') return null
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim())
  if (!match) return null
  const mime = match[1]!.toLowerCase()
  if (!ALLOWED_IMAGE_MIME.includes(mime)) return null
  let bytes: Buffer
  try {
    bytes = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64')
  }
  catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > AI_IMAGE_MAX_BYTES) return null
  return { mime, bytes: new Uint8Array(bytes) }
}

/**
 * DIE ANTWORT-KLEMMUNG. Aus der Bild-Liste einer Antwort werden höchstens vier
 * geprüfte Bilder; alles Unbrauchbare fällt still weg, weil ein einzelnes
 * kaputtes Bild einen Lauf mit drei guten nicht wertlos macht.
 */
export function clampAiImages(images: unknown): AiImageResult[] {
  if (!Array.isArray(images)) return []
  const out: AiImageResult[] = []
  for (const entry of images) {
    if (out.length >= AI_IMAGE_MAX_IMAGES) break
    const url = (entry as { image_url?: { url?: unknown } } | null)?.image_url?.url
    const parsed = parseAiImageDataUrl(url)
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * DAS BILD-GATE (Core-Default AUS): `pukalani.ai.imageModel`, leer.
 *
 * Wörtlich dieselbe Begründung wie beim Vision-Gate: `pukalani.ai.enabled`
 * zählt NICHT mit, weil dieser Schalter den TEXT-Konsumenten des Core gehört
 * und in keiner App ansteht, die heute Bilder erzeugen will (`apps/branding`
 * fährt seinen KI-Weg über `app_config.brandAiEnabled`). Der EIGENE
 * Ausschalter ist der Modell-Name selbst — per Default leer, also überall aus.
 */
export function getAiImageConfig(): AiImageConfig {
  const appConfig = useAppConfig() as {
    pukalani?: { ai?: { imageModel?: unknown, baseUrl?: unknown } }
  }
  const ai = appConfig.pukalani?.ai
  const model = typeof ai?.imageModel === 'string' ? ai.imageModel.trim() : ''
  const baseUrl = typeof ai?.baseUrl === 'string' && ai.baseUrl
    ? ai.baseUrl
    : 'https://openrouter.ai/api/v1'
  return { enabled: model.length > 0, model, baseUrl: baseUrl.replace(/\/$/, '') }
}

export interface EffectiveAiImageConfig extends AiImageConfig {
  /** Build-Default aus `pukalani.ai.imageModel` — für UI-Platzhalter. */
  defaultModel: string
}

/**
 * Effektive Bild-Config inkl. LAUFZEIT-OVERRIDE `app_config.aiImageModel` —
 * dieselbe Bauform wie `getEffectiveAiVisionConfig`.
 *
 * OHNE MIGRATION, und das ist kein Versehen: eine Appwrite-Zeile liefert nicht
 * angelegte Felder als `undefined`, also gilt dann der Build-Default. Der
 * Override ist VORBEREITET, ohne dass ein Deploy auf ein Schema wartet.
 *
 * Best-effort: ein Lesefehler ist kein Fehler, sondern der Build-Default.
 */
export async function getEffectiveAiImageConfig(
  event: H3Event,
): Promise<EffectiveAiImageConfig> {
  const base = getAiImageConfig()
  const config: EffectiveAiImageConfig = { ...base, defaultModel: base.model }
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<
      import('node-appwrite').Models.Row & { aiImageModel?: string }
    >({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    if (typeof row.aiImageModel === 'string' && row.aiImageModel.trim()) {
      config.model = row.aiImageModel.trim()
      config.enabled = true
    }
  }
  catch { /* Override nicht lesbar → Build-Default */ }
  return config
}

/**
 * Ist der Bild-Pfad nutzbar (Modell konfiguriert UND Schlüssel vorhanden)?
 *
 * ASYNC wie `isAiVisionConfigured`, und aus demselben Grund: der Schlüssel kann
 * aus der Datenbank kommen. Ein vergessenes `await` an einem `if (!isAi…)` wäre
 * kein Typfehler (ein Promise ist truthy), sondern ein still fail-open
 * geöffnetes Gate — der Name macht das Warten sichtbar.
 */
export async function isAiImageConfigured(event: H3Event): Promise<boolean> {
  const config = await getEffectiveAiImageConfig(event)
  if (!config.enabled) return false
  return Boolean(await resolveAiKey(event))
}

/**
 * BILDER ERZEUGEN. Wirft 503, wenn kein Modell oder kein Schlüssel da ist —
 * der Konsument prüft das über `isAiImageConfigured()` VOR dem Aufruf und
 * macht daraus seinen eigenen, ruhigen Satz.
 *
 * Die Rückgabe ist eine LISTE, weil ein Modell mehrere Bilder in einer Antwort
 * schicken darf; sie kann LEER sein (Modell hat nur Text geliefert) — auch das
 * ist kein Wurf, sondern eine Tatsache, die der Aufrufer beurteilt.
 */
export async function aiImage(
  event: H3Event,
  prompt: string,
  options: AiImageOptions = {},
): Promise<AiImageResult[]> {
  /**
   * Das Modell darf explizit übergeben werden, sonst gilt die EFFEKTIVE
   * Config — dieselbe Quelle, die `isAiImageConfigured()` liest.
   *
   * Vorher stand hier `getAiImageConfig()` (der Build-Default), während das
   * GATE schon die effektive Config befragte: mit einem Laufzeit-Override in
   * `app_config` sagte das Gate „ja" und der Aufruf lief ins leere
   * Build-Modell — also 503 trotz konfigurierter Instanz (Audit-Befund
   * 2026-09-09). Mit `options.model` fragt hier NIEMAND die Datenbank.
   */
  const defaults = options.model ? getAiImageConfig() : await getEffectiveAiImageConfig(event)
  const label = options.label ?? 'core'
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  if (!model) {
    throw createError({ status: 503, statusText: 'AI image generation not configured' })
  }
  const apiKey = options.apiKey || await resolveAiKey(event)
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
  }
  if (!prompt.trim()) {
    throw createError({ status: 400, statusText: 'AI image needs a prompt' })
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
      body: JSON.stringify(buildAiImageRequestBody({
        model,
        prompt,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerRouting: options.providerRouting,
      })),
    })
    if (!res.ok) {
      // STATUS UND KENNUNG, NIE DER RUMPF: ein Fehler-Rumpf zitiert je nach
      // Anbieter Teile der Anfrage zurück — hier also den Prompt, der
      // Kundeninhalte trägt (`aiProviderErrorTag`, Audit-Befund 2026-09-09).
      console.error(`[${label}] KI-Bild-API ${res.status}${aiProviderErrorTag(await res.text())}`)
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }
    const payload = await res.json() as {
      choices?: { message?: { images?: unknown } }[]
    }
    const images = clampAiImages(payload.choices?.[0]?.message?.images)
    // Nur KENNZAHLEN — nie die Bytes, nie der Prompt (s. Kopf).
    const totalBytes = images.reduce((sum, image) => sum + image.bytes.length, 0)
    logEvent('info', 'ai.image_run', { model, images: images.length, bytes: totalBytes })
    return images
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error(
      `[${label}] KI-Bild fehlgeschlagen:`,
      error instanceof Error ? error.message : 'unknown',
    )
    throw createError({ status: 502, statusText: 'AI image generation failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}
