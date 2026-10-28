import type { H3Event } from 'h3'
import { type AiProviderRouting, aiProviderErrorTag } from './aiComplete'

/**
 * VIDEOS LESEN — der vierte Transport des Core, neben `aiComplete` (Text),
 * `aiVision` (Bilder) und `aiImage` (Bilder erzeugen).
 *
 * Gebaut für BI2 K5 („Brief aus diesem Video", Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §6 und §13) nach Davids Entscheidung
 * zu Frage C vom 2026-10-27.
 *
 * ── DIESELBE FAMILIE, EIN DRITTER NACHRICHTEN-TYP ────────────────────────
 * Dieselbe OpenAI-kompatible Chat-Completions-API, derselbe Schlüssel
 * (`resolveAiKey`: Konsole vor Env), dieselbe Antwort-Form. Der Unterschied
 * ist wieder nur der INHALT einer Nachricht: statt `image_url` reist ein
 * `video_url`-Teil mit einer ADRESSE
 * (`[{type:'text'},{type:'video_url',video_url:{url:'https://…'}}]`).
 *
 * Eine eigene Datei aus denselben zwei Gründen, die im Kopf von `aiVision.ts`
 * stehen, und einem dritten: ein Video ist nicht nur ein grösseres Bild. Es
 * kostet ein Vielfaches (gemessen: ein 25-Minuten-Video sind ~135.000
 * Prompt-Tokens, rund fünf Cent), es braucht Minuten statt Sekunden, und es
 * reist als ADRESSE statt als Bytes. Jede dieser drei Eigenschaften hat hier
 * eine andere Zahl als dort — in einer gemeinsamen Funktion wären es
 * Sonderfälle mit `if`.
 *
 * ── WAS DIE PROBE VOM 2026-10-27 BELEGT (und was die Doku behauptet) ─────
 * Gemessen mit echten Anfragen, Plan §13:
 *  · Eine YouTube-Adresse unter `zdr: true` + `data_collection: 'deny'` +
 *    `allow_fallbacks: false` wird gelesen — Bild UND Ton. Beweis ist die
 *    ABRECHNUNG (`usage.prompt_tokens_details.video_tokens` und
 *    `audio_tokens`), nicht der Text der Antwort.
 *  · Das geht sogar auf `only: ['google-vertex/eu']`. OpenRouters Doku sagt
 *    das Gegenteil („nur Google AI Studio nimmt YouTube-Links, Vertex nimmt
 *    keine Video-URLs") — sie ist an diesem Punkt überholt.
 *  · „google-ai-studio" ist unter `zdr: true` gar nicht erreichbar (404).
 *    Diese Route steht uns also ohnehin nicht offen; sie wird auch nicht
 *    gebraucht.
 *  · Eine erfundene Video-Id ⇒ 502 vom Anbieter. Das Modell antwortet NICHT
 *    aus dem Titel heraus — wer hier eine Antwort bekommt, hat ein gelesenes
 *    Video.
 *
 * ── DIE ZDR-KLEMME IST NICHT VERHANDELBAR ────────────────────────────────
 * Wörtlich wie bei `aiVision`: `data_collection: 'deny'` setzt der TRANSPORT,
 * es steht zuletzt im `provider`-Objekt und lässt sich von aussen nicht
 * abschalten. `options.providerRouting` darf nur VERSCHÄRFEN (`zdr`, `only`,
 * `allowFallbacks`). Der Konsument in `insights` reicht
 * `BRAND_PROVIDER_ROUTING_EU` — dieselbe EU-gepinnte Fassung, die die
 * Inspirationslesung benutzt.
 *
 * ── KEINE BYTES, NUR ADRESSEN ────────────────────────────────────────────
 * Dieser Transport nimmt ausschliesslich `http(s)`-Adressen und verweigert
 * `data:`-URIs. Das ist kein Geschmack, sondern die Rechnung: ein
 * base64-kodiertes Video sind hunderte Megabyte in EINEM Request-Rumpf, der
 * vor dem Absenden vollständig im Speicher steht. Wer ein Video als Datei
 * auswerten will, braucht einen anderen Weg (Upload-API) und eine eigene
 * Entscheidung dazu.
 *
 * ── WAS INS LOG GEHT ─────────────────────────────────────────────────────
 * Nie der Prompt, nie die Antwort. Die ADRESSE schon: sie ist öffentlich (das
 * ist die Bedingung, unter der ein Modell sie überhaupt lesen kann) und ohne
 * sie wäre ein Fehlschlag nicht zuzuordnen.
 */

/**
 * DREI MINUTEN. Ein Video-Aufruf ist kein Text-Aufruf: der Anbieter lädt das
 * Video, dekodiert Bild- und Tonspur und rechnet darüber. Gemessen (Probe
 * 2026-10-27): ein 19-Sekunden-Video antwortet in Sekunden, ein
 * 25-Minuten-Video braucht deutlich länger.
 *
 * Der Deckel ist trotzdem da, und er ist eine Entscheidung: lieber ein
 * ehrlicher Abbruch als ein Request, der eine Viertelstunde einen
 * Nitro-Handler belegt.
 */
const DEFAULT_TIMEOUT_MS = 180_000

/** Video-Aufrufe antworten strukturiert — ein Brief, kein Manuskript. */
const DEFAULT_MAX_TOKENS = 2500

/**
 * WIE VIELE VIDEOS EIN ZUG HÖCHSTENS TRÄGT.
 *
 * Zehn ist die dokumentierte Obergrenze der Gemini-Modelle ab 2.5 (davor
 * eines). Der Transport klemmt auf diese Zahl, weil ein Konsument mit einer
 * ungeklemmten Liste sonst einen Request baut, den der Anbieter nach Minuten
 * ablehnt — bezahlt ist der Versuch trotzdem (dieselbe Lehre wie bei
 * `AI_VISION_MAX_IMAGES`).
 *
 * Der PRODUKT-Deckel ist enger und gehört dem Konsumenten: K5 schickt genau
 * EIN Video, weil ein Brief über zwei Videos kein Brief ist.
 */
export const AI_VIDEO_MAX_VIDEOS = 10

/** Wie lang eine Video-Adresse sein darf — grosszügig, aber nicht unendlich. */
export const AI_VIDEO_URL_MAX = 2000

export interface AiVideoConfig {
  /** `false` = kein Video-Modell konfiguriert (Core-Default). */
  enabled: boolean
  /** `pukalani.ai.videoModel` — leer heisst aus. */
  model: string
  baseUrl: string
}

/**
 * EIN VIDEO, wie der Transport es nimmt: eine öffentliche Adresse.
 *
 * `processing` ist Gemini-eigen (`agentic` = das Modell darf hin- und
 * herspringen, `static` = feste Abtastung); andere Anbieter ignorieren das
 * Feld. Es ist optional und hier KEIN Sparhebel: in der Probe vom 2026-10-27
 * standen mit und ohne `static` dieselben Token-Zahlen in der Abrechnung (der
 * scheinbare Preissturz des zweiten Laufs war der Prompt-Cache). Wer es
 * setzt, tut das wegen der Arbeitsweise, nicht wegen der Rechnung.
 *
 * `label` steht als eigener Text-Teil VOR dem Video — so kann ein Prompt
 * „Video 2" sagen, wenn doch einmal mehrere reisen.
 */
export interface AiVideoSource {
  readonly url: string
  readonly processing?: 'agentic' | 'static'
  readonly label?: string
}

export interface AiVideoOptions {
  /** Model-Override — Default: `pukalani.ai.videoModel`. */
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

export interface AiVideoRequestBodyInput {
  model: string
  prompt: string
  videos: readonly AiVideoSource[]
  system?: string
  temperature?: number
  maxTokens?: number
  providerRouting?: AiProviderRouting
}

type VideoContentPart =
  | { type: 'text', text: string }
  | { type: 'video_url', video_url: { url: string }, processing?: 'agentic' | 'static' }

/**
 * NIMMT DER TRANSPORT DIESE ADRESSE? — pur, damit ein Test sie lesen kann.
 *
 * Erlaubt ist `http`/`https`. Alles andere fällt durch, und zwar NAMENTLICH
 * `data:` (s. Kopf) — aber auch `file:` und `blob:`, die nichts sind, was ein
 * fremder Anbieter abrufen könnte.
 */
export function aiVideoUrlAllowed(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed || trimmed.length > AI_VIDEO_URL_MAX) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  }
  catch {
    return false
  }
}

/**
 * DER REQUEST-BAU — exportiert und ohne H3Event/fetch, damit der Beweis den
 * tatsächlich abgeschickten Body liest und nicht den Aufruf.
 *
 * Reihenfolge im Zug: erst der PROMPT, dann je Video Beschriftung und Video.
 * Der Prompt zuerst, aus demselben Grund wie bei den Bildern — ein Modell,
 * das erst nach dem Material erfährt, wonach es suchen soll, arbeitet
 * schlechter. Bei einem Video kostet eine schlechtere Arbeit ausserdem
 * dasselbe wie eine gute.
 */
export function buildAiVideoRequestBody(
  input: AiVideoRequestBodyInput,
): Record<string, unknown> {
  const content: VideoContentPart[] = [{ type: 'text', text: input.prompt }]
  for (const video of input.videos) {
    if (video.label) content.push({ type: 'text', text: video.label })
    content.push({
      type: 'video_url',
      video_url: { url: video.url.trim() },
      ...(video.processing ? { processing: video.processing } : {}),
    })
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
 * DAS VIDEO-GATE (Core-Default AUS): `pukalani.ai.videoModel`, leer.
 *
 * Wörtlich dieselbe Bauform und dieselbe Begründung wie beim Vision-Gate: der
 * Ausschalter ist der Modell-NAME, nicht ein zweites Flag. `pukalani.ai.
 * enabled` zählt bewusst nicht mit — es gehört den Text-Konsumenten des Core,
 * und `apps/branding` setzt es nie.
 *
 * Bei Video kommt ein zweiter Grund dazu, der bei Bildern noch nicht so
 * schwer wog: NICHT JEDES MODELL KANN ES. Das Textmodell dieses Monorepos
 * (`anthropic/claude-haiku-4.5`) sieht keine Videos. Ein Gate, das am
 * allgemeinen KI-Schalter hinge, wäre deshalb eine Einladung, mit dem
 * falschen Modell zu rufen — hier steht genau der Schlüssel, der die Antwort
 * trägt.
 */
export function getAiVideoConfig(): AiVideoConfig {
  const appConfig = useAppConfig() as {
    pukalani?: { ai?: { videoModel?: unknown, baseUrl?: unknown } }
  }
  const ai = appConfig.pukalani?.ai
  const model = typeof ai?.videoModel === 'string' ? ai.videoModel.trim() : ''
  const baseUrl = typeof ai?.baseUrl === 'string' && ai.baseUrl
    ? ai.baseUrl
    : 'https://openrouter.ai/api/v1'
  return { enabled: model.length > 0, model, baseUrl: baseUrl.replace(/\/$/, '') }
}

export interface EffectiveAiVideoConfig extends AiVideoConfig {
  /** Build-Default aus `pukalani.ai.videoModel` — für UI-Platzhalter. */
  defaultModel: string
}

/**
 * Effektive Video-Config inkl. LAUFZEIT-OVERRIDE `app_config.aiVideoModel`.
 *
 * Wie beim Vision-Modell OHNE Migration: eine Appwrite-Zeile liefert nicht
 * angelegte Felder als `undefined`, also gilt dann der Build-Default. Der
 * Override ist damit vorbereitet, ohne dass ein Deploy auf ein Schema wartet;
 * wer ihn bedienen will, legt die Spalte an, und der Code hier ändert sich
 * nicht. Best-effort: ein Lesefehler ist kein Fehler, sondern der
 * Build-Default.
 */
export async function getEffectiveAiVideoConfig(
  event: H3Event,
): Promise<EffectiveAiVideoConfig> {
  const base = getAiVideoConfig()
  const config: EffectiveAiVideoConfig = { ...base, defaultModel: base.model }
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<
      import('node-appwrite').Models.Row & { aiVideoModel?: string }
    >({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    if (typeof row.aiVideoModel === 'string' && row.aiVideoModel.trim()) {
      config.model = row.aiVideoModel.trim()
      config.enabled = true
    }
  }
  catch { /* Override nicht lesbar → Build-Default */ }
  return config
}

/**
 * Ist der Video-Pfad nutzbar (Modell konfiguriert UND Schlüssel vorhanden)?
 *
 * ASYNC aus demselben Grund wie `isAiVisionConfigured`: der Schlüssel kann aus
 * der Datenbank kommen, und ein vergessenes `await` wäre kein Typfehler,
 * sondern ein fail-open geöffnetes Gate.
 */
export async function isAiVideoConfigured(event: H3Event): Promise<boolean> {
  const config = await getEffectiveAiVideoConfig(event)
  if (!config.enabled) return false
  return Boolean(await resolveAiKey(event))
}

/**
 * EIN VIDEO LESEN. Wirft 503 ohne Modell oder Schlüssel — der Konsument prüft
 * das über `isAiVideoConfigured()` VOR dem Aufruf und macht daraus seinen
 * eigenen, ruhigen Satz.
 */
export async function aiVideo(
  event: H3Event,
  videos: readonly AiVideoSource[],
  prompt: string,
  options: AiVideoOptions = {},
): Promise<string> {
  // Mit `options.model` fragt hier NIEMAND die Datenbank: der Aufrufer hat
  // seine Wahl schon getroffen (derselbe Audit-Befund wie bei `aiVision`).
  const defaults = options.model ? getAiVideoConfig() : await getEffectiveAiVideoConfig(event)
  const label = options.label ?? 'core'
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  if (!model) {
    throw createError({ status: 503, statusText: 'AI video not configured' })
  }
  const apiKey = options.apiKey || await resolveAiKey(event)
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
  }
  if (videos.length === 0) {
    throw createError({ status: 400, statusText: 'AI video needs at least one video' })
  }

  // Die Transport-Klemmen, VOR dem Netzaufruf. Ein Video-Aufruf ist der
  // teuerste Weg dieses Monorepos — was hier durchfällt, kostet nichts.
  if (videos.length > AI_VIDEO_MAX_VIDEOS) {
    console.error(`[${label}] KI-Video abgewiesen: ${videos.length} Videos (max ${AI_VIDEO_MAX_VIDEOS})`)
    throw createError({ status: 413, statusText: 'AI video got too many videos' })
  }
  const rejected = videos.find(video => !aiVideoUrlAllowed(video.url))
  if (rejected) {
    console.error(`[${label}] KI-Video abgewiesen: Adresse nicht erlaubt (${rejected.url.slice(0, 40)}…)`)
    throw createError({ status: 400, statusText: 'AI video got an unsupported url' })
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
      body: JSON.stringify(buildAiVideoRequestBody({
        model,
        prompt,
        videos,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerRouting: options.providerRouting,
      })),
    })
    if (!res.ok) {
      // STATUS UND KENNUNG, NIE DER RUMPF (`aiProviderErrorTag`) — ein
      // Fehler-Rumpf zitiert je nach Anbieter Teile der Anfrage zurück.
      console.error(
        `[${label}] KI-Video-API ${res.status}${aiProviderErrorTag(await res.text())} `
        + `(${videos.length} Video(s))`,
      )
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }
    const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
    return payload.choices?.[0]?.message?.content ?? ''
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error(
      `[${label}] KI-Video fehlgeschlagen (${videos.length} Video(s)):`,
      error instanceof Error ? error.message : 'unknown',
    )
    throw createError({ status: 502, statusText: 'AI video failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * Video mit JSON-Antwort — dieselben Regeln wie `aiCompleteJson`/`aiVisionJson`:
 * defensiv auf das äussere Objekt zuschneiden (`extractJsonObject`), parsen,
 * und die FELDER klemmt der Aufrufer. `T` ist eine Behauptung, kein Beweis.
 *
 * Die ROHE Antwort steht bewusst nicht im Log; was zur Diagnose bleibt, ist
 * ihre Länge.
 */
export async function aiVideoJson<T = unknown>(
  event: H3Event,
  videos: readonly AiVideoSource[],
  prompt: string,
  options: AiVideoOptions = {},
): Promise<T> {
  const raw = await aiVideo(event, videos, prompt, options)
  try {
    return JSON.parse(extractJsonObject(raw)) as T
  }
  catch {
    console.error(
      `[${options.label ?? 'core'}] KI-Video-Antwort war kein JSON (${raw.length} Zeichen)`,
    )
    throw createError({ status: 502, statusText: 'AI returned no JSON' })
  }
}
