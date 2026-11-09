import type { H3Event } from 'h3'
import type { ModelJsonResult } from '../../shared/aiJson'
import { extractJsonObject as extractJsonObjectRule, parseModelJson } from '../../shared/aiJson'

/**
 * Generischer KI-Completion-Client (Core): EIN Transport für alle Server-
 * seitigen KI-Produkte (Ticket-Triage, Moderations-Assist, …) über eine
 * OpenAI-kompatible Chat-Completions-API (Default: OpenRouter).
 *
 * Policy bleibt beim Konsumenten: aiComplete() prüft nur, ob ein Key da ist —
 * Gates (pukalani.ai.enabled bzw. Layer-eigene wie pukalani.tickets.ai) und die
 * Validierung der Antwort gehören in den aufrufenden Layer. Key-Auflösung:
 * options.apiKey (Layer-eigener Key) sonst NUXT_AI_KEY (Core).
 */

const DEFAULT_TIMEOUT_MS = 45_000

export interface AiConfig {
  enabled: boolean
  model: string
  baseUrl: string
}

/**
 * OpenRouter-PROVIDER-ROUTING — „welcher Anbieter darf diesen Prompt sehen,
 * und unter welchen Bedingungen".
 *
 * Warum das in den Transport gehört und trotzdem keine Policy ist: die Felder
 * reisen im REQUEST, ein Konsument kann sie also nicht nachträglich anlegen.
 * Der Transport übersetzt sie nur in OpenRouters Schreibweise
 * (`data_collection`, `allow_fallbacks`) und setzt KEINE Vorgaben: ohne diese
 * Option ändert sich der Request um kein Byte, und wer sie setzt, bekommt
 * genau das gesendet, was er geschrieben hat — auch eine leere Allowlist wird
 * nicht stillschweigend weggelassen (ein weggelassener `only`-Eintrag wäre
 * fail-OPEN, und diese Entscheidung gehört dem Aufrufer).
 *
 * Der erste Konsument ist der Brand-Wizard: `zdr: true`,
 * `dataCollection: 'deny'`, geprüfte `only`-Allowlist, `allowFallbacks: false`
 * — fail-closed, lieber „gerade nicht verfügbar" als ein stiller Ausweich auf
 * einen Nicht-ZDR-Anbieter.
 */
export interface AiProviderRouting {
  /** Nur Anbieter mit Zero-Data-Retention. */
  zdr?: boolean
  /** `'deny'` = der Anbieter darf den Inhalt nicht zum Training sammeln. */
  dataCollection?: 'allow' | 'deny'
  /**
   * Allowlist von Anbieter-Slugs — wörtlich übernommen.
   *
   * `readonly`, weil der Transport diese Liste nur LIEST (er kopiert sie beim
   * Request-Bau: `only: [...routing.only]`). Mit `string[]` liess sich ein
   * `as const`-Vertrag nicht übergeben — eine EU-gepinnte Konstante
   * (`BRAND_PROVIDER_ROUTING_EU`) wurde so zum Typfehler an der Aufrufstelle,
   * und der naheliegende Ausweg wäre gewesen, dem Vertrag sein `as const` zu
   * nehmen. Genau das wäre der Fehler: die Konstante reist per Spread
   * (`{ ...ROUTING }`), und ein Spread kopiert die REFERENZ auf das Array —
   * eine mutable Allowlist wäre von jeder Aufrufstelle aus veränderbar
   * gewesen (dieselbe Falle wie beim leeren Radar-Filter in BI2 K2, der
   * deshalb eine Funktion ist und keine Konstante).
   *
   * Die Weitung erlaubt also mehr Aufrufer und verbietet gleichzeitig mehr:
   * wer diese Liste ändern will, baut eine neue.
   */
  only?: readonly string[]
  /** `false` = kein Ausweichen auf einen Anbieter außerhalb der Bedingungen. */
  allowFallbacks?: boolean
}

/**
 * DIE FEHLER-KENNUNG DES ANBIETERS — für das Log, OHNE seinen Rumpf.
 *
 * Ein Fehler-Rumpf einer OpenAI-kompatiblen API ist keine reine Diagnose: er
 * zitiert je nach Anbieter Teile der Anfrage zurück (`error.metadata`, die
 * beanstandete Nachricht, bei Bild-Aufrufen sogar Ausschnitte des `data:`-URI).
 * Genau das darf hier nicht ins Log — die Bild- und Vision-Wege tragen
 * KUNDEN-Inhalte, und ihre Köpfe sagen zu: „Bilder reisen nie ins Log".
 *
 * Was bleibt, ist das, was eine Diagnose wirklich braucht: der HTTP-Status
 * (nennt der Aufrufer selbst) plus `error.code`/`error.type`, wenn der Anbieter
 * sie mitschickt. Beides sind kurze, feste Kennungen aus SEINEM Vokabular
 * (`invalid_request_error`, `rate_limit_exceeded`) — sie können nichts
 * zurückzitieren. Ist der Rumpf kein JSON oder trägt er keine Kennung, gibt es
 * eine leere Zeichenkette: eine Zeile ohne Kennung ist ehrlicher als eine mit
 * geratenem Inhalt.
 *
 * DER TEXT-WEG (`aiComplete`, unten) loggt seinen Rumpf VORERST WEITER — er
 * war nicht Teil des Audit-Befundes vom 2026-09-09, und ihn hier mitzuändern
 * hiesse, den meistgenutzten Diagnose-Pfad des Core in einem Nebensatz
 * umzustellen. Diese Funktion steht trotzdem hier und nicht bei den Bildern:
 * sie gehört zur Antwort-FORM dieser API-Familie, nicht zu einem ihrer drei
 * Transporte.
 */
export function aiProviderErrorTag(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown, type?: unknown } }
    const code = typeof parsed.error?.code === 'string' ? parsed.error.code : ''
    const type = typeof parsed.error?.type === 'string' ? parsed.error.type : ''
    const parts = [code, type].filter(part => part.length > 0 && part.length <= 64)
    return parts.length > 0 ? ` (${parts.join('/')})` : ''
  }
  catch {
    return ''
  }
}

export interface AiCompleteOptions {
  /** Model-Override — Default: pukalani.ai.model */
  model?: string
  /** Endpoint-Override (ohne trailing Slash nötig) — Default: pukalani.ai.baseUrl */
  baseUrl?: string
  /** Layer-eigener Key — Default: `resolveAiKey()` (Konsole vor NUXT_AI_KEY) */
  apiKey?: string
  system?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Log-Präfix des Aufrufers (z.B. 'tickets') — Fehler bleiben zuordenbar */
  label?: string
  /** OpenRouter-Provider-Routing (ZDR/Allowlist/kein Fallback) — s. AiProviderRouting */
  providerRouting?: AiProviderRouting
}

export interface AiRequestBodyInput {
  model: string
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  providerRouting?: AiProviderRouting
  /** Nur gesetzt, wenn wahr — der heutige Non-Streaming-Body bleibt unverändert. */
  stream?: boolean
}

/**
 * DER EINE REQUEST-BAU. Bewusst exportiert und ohne H3Event/fetch: eine
 * spätere Streaming-Variante (`stream: true`) baut ihren Body durch DIESELBE
 * Funktion — sonst driften die Datenschutz-Felder auseinander, und ausgerechnet
 * der Streaming-Pfad (der Brand-Wizard) führe ohne ZDR-Bedingungen.
 */
export function buildAiRequestBody(input: AiRequestBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      { role: 'user', content: input.prompt },
    ],
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 700,
  }

  const routing = input.providerRouting
  if (routing) {
    const provider: Record<string, unknown> = {}
    if (routing.zdr !== undefined) provider.zdr = routing.zdr
    if (routing.dataCollection !== undefined) provider.data_collection = routing.dataCollection
    if (routing.only !== undefined) provider.only = [...routing.only]
    if (routing.allowFallbacks !== undefined) provider.allow_fallbacks = routing.allowFallbacks
    // Ein leeres Routing-Objekt darf kein leeres `provider` senden — das wäre
    // eine Behauptung ohne Inhalt.
    if (Object.keys(provider).length > 0) body.provider = provider
  }

  if (input.stream) body.stream = true

  return body
}

/** Core-KI-Gate (pukalani.ai) — Konsumenten prüfen enabled, Transport nicht. */
export function getAiConfig(): AiConfig {
  const appConfig = useAppConfig() as { pukalani?: { ai?: Partial<AiConfig> } }
  const ai = appConfig.pukalani?.ai
  return {
    enabled: ai?.enabled ?? false,
    model: ai?.model ?? 'anthropic/claude-haiku-4.5',
    baseUrl: (ai?.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  }
}

/**
 * WOHER DER KI-SCHLÜSSEL KOMMT — zwei Quellen, feste Rangfolge: **DB schlägt
 * Env** (Davids Entscheidung 2026-08-18, Muster von F55/Stripe).
 *
 * Die DB-Zeile trägt der Betreiber über die Konsole ein
 * (`instance_secrets`, system-036), die Env bleibt der Weg für alles ohne
 * Oberfläche: CI, lokale Entwicklung, Notfall-Rückfall nach einem
 * Fehleintrag. Stünde die Env vorn, hätte ein Eintrag über die Konsole auf
 * einer Instanz mit gesetzter Env keinerlei Wirkung — die vollständige
 * Begründung steht in `instanceSecrets.ts`.
 *
 * Fail-soft: fehlt die Tabelle oder der Umschlag-Schlüssel, gilt die Env.
 */
export async function resolveAiKey(event: H3Event): Promise<string> {
  const stored = await readInstanceSecret(event, 'ai')
  if (stored) return stored
  return useRuntimeConfig(event).aiKey || ''
}

/**
 * Ist der Core-KI-Pfad nutzbar (Gate an UND Schlüssel vorhanden)? Für UI-Flags
 * und als Netz in den Routen.
 *
 * HIESS BIS 2026-08-18 `isAiAvailable` UND WAR SYNCHRON. Die Umbenennung ist
 * die eigentliche Sicherung: seit der Schlüssel auch aus der Datenbank kommen
 * kann, muss die Antwort erwartet werden — und ein vergessenes `await` an
 * einem `if (!isAiAvailable(event))` wäre KEIN Typfehler gewesen (ein Promise
 * ist immer truthy), sondern ein still fail-open geöffnetes Gate. Mit dem
 * neuen Namen bricht jede nicht umgestellte Aufrufstelle beim Übersetzen.
 */
export async function isAiConfigured(event: H3Event): Promise<boolean> {
  if (!getAiConfig().enabled) return false
  return Boolean(await resolveAiKey(event))
}

export interface EffectiveAiConfig extends AiConfig {
  /** Build-Default aus pukalani.ai.model (ohne Laufzeit-Override) — für UI-Placeholder */
  defaultModel: string
}

/**
 * Effektive Core-KI-Config inkl. Laufzeit-Override: app_config.aiModel
 * (system-016, Admin-Config-Seite) schlägt den Build-Default — best-effort,
 * bei Lesefehler gilt der Default. Layer-eigene Overrides (z. B.
 * app_config.ticketsAiModel) bleiben Sache des jeweiligen Layers und
 * schlagen dieses globale Override.
 */
export async function getEffectiveAiConfig(event: H3Event): Promise<EffectiveAiConfig> {
  const base = getAiConfig()
  const config: EffectiveAiConfig = { ...base, defaultModel: base.model }
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<import('node-appwrite').Models.Row & { aiModel?: string }>({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    if (typeof row.aiModel === 'string' && row.aiModel.trim()) {
      config.model = row.aiModel.trim()
    }
  }
  catch { /* Override nicht lesbar → Build-Default */ }
  return config
}

/**
 * WAS EINE ANTWORT AUSSER DEM TEXT NOCH SAGT (BI4, 2026-11-08).
 *
 * `finishReason` ist der EINZIGE direkte Beweis für „die Token-Decke ist
 * gerissen" (`'length'` statt `'stop'`), und `completionTokens` sagt, wie
 * nah es war. Bis BI4 warf der Transport beides weg und las nur
 * `choices[0].message.content` — ein abgeschnittener Lauf war dadurch von
 * einem Modell, das Unsinn geschrieben hat, nicht zu unterscheiden, und die
 * Diagnose von BI4 musste an OpenRouter vorbei gemessen werden statt im Log
 * zu stehen.
 *
 * ── WARUM AUCH DIE EINGABE-TOKENS (2026-11-09) ───────────────────────────
 * BI4 brauchte nur die AUSGABE, weil nur sie an die Decke stößt. Für die
 * Frage „was hat dieser Lauf gekostet?" reicht sie nicht: Anbieter rechnen
 * Eingabe und Ausgabe zu VERSCHIEDENEN Preisen ab (bei Haiku 4.5 ist die
 * Ausgabe das Fünffache), und der Prompt einer Redaktions-Route ist kein
 * Rundungsfehler — er trägt Regelwerk, Brief und Markennamen. Mit nur einer
 * der beiden Zahlen ist jede Kostenangabe eine Schätzung, die sich als
 * Messung ausgibt. Beide sind `0`, wenn der Anbieter sie nicht nennt — ein
 * `0` heißt hier „nicht gesagt", nie „nichts verbraucht".
 */
export interface AiCompletion {
  content: string
  /** OpenAI-kompatibel: `'stop'`, `'length'`, … — oder `''`, wenn es fehlt. */
  finishReason: string
  /** Gelesene Tokens laut Anbieter (Prompt + System) — `0`, wenn er keine nennt. */
  promptTokens: number
  /** Erzeugte Tokens laut Anbieter — `0`, wenn er keine nennt. */
  completionTokens: number
}

/**
 * Der Text-Weg, OHNE die Nebendaten — die ALTE, unveränderte Schnittstelle
 * für jeden Konsumenten, der nur den Text will (Triage, Assist,
 * Übersetzung, Brand-Wizard).
 */
export async function aiComplete(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<string> {
  return (await aiCompleteDetailed(event, prompt, options)).content
}

export async function aiCompleteDetailed(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<AiCompletion> {
  const defaults = getAiConfig()
  const label = options.label ?? 'core'
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  const apiKey = options.apiKey || await resolveAiKey(event)
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
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
      body: JSON.stringify(buildAiRequestBody({
        model,
        prompt,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerRouting: options.providerRouting,
      })),
    })
    if (!res.ok) {
      console.error(`[${label}] KI-API ${res.status}: ${(await res.text()).slice(0, 300)}`)
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }
    const payload = await res.json() as {
      choices?: { message?: { content?: string }, finish_reason?: string }[]
      usage?: { prompt_tokens?: number, completion_tokens?: number }
    }
    const choice = payload.choices?.[0]
    return {
      content: choice?.message?.content ?? '',
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : '',
      promptTokens: typeof payload.usage?.prompt_tokens === 'number' ? payload.usage.prompt_tokens : 0,
      completionTokens: typeof payload.usage?.completion_tokens === 'number' ? payload.usage.completion_tokens : 0,
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error(`[${label}] KI-Completion fehlgeschlagen:`, error)
    throw createError({ status: 502, statusText: 'AI completion failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * DAS ZUSCHNEIDEN WOHNT SEIT BI4 IN `core/shared/aiJson.ts` — zusammen mit
 * der Reparatur, die dasselbe Problem einen Schritt weiter löst. Hier steht
 * nur noch der Re-Export: `aiVisionJson`/`aiVideoJson` holen sich diesen
 * Namen per Auto-Import aus dieser Datei, und ein Umzug des NAMENS wäre eine
 * Änderung an zwei Transporten, die mit BI4 nichts zu tun haben.
 */
export const extractJsonObject = extractJsonObjectRule

/**
 * WIE EIN KONSUMENT EINE KAPUTTE ANTWORT ERKLÄRT (BI4, 2026-11-08).
 *
 * `'ai_truncated'` reist als `data: { code }` und hebt sich im zentralen
 * Handler zum `reason` — die Oberfläche kann damit sagen, WAS passiert ist
 * („das Modell hat mitten im Satz aufgehört") und was der Mensch ändern kann
 * (kürzer bestellen), statt „AI returned no JSON".
 */
export const AI_TRUNCATED_CODE = 'ai_truncated'

/**
 * Completion mit JSON-Antwort: schneidet defensiv auf das äußere Objekt zu
 * (manche Modelle wrappen trotz Anweisung in ```json) und parst. Der Aufrufer
 * validiert/klemmt die Felder selbst — T ist eine Behauptung, kein Beweis
 * (deshalb sinnvollerweise Partial<...> übergeben).
 *
 * DIE ALTE, UNVERÄNDERTE SCHNITTSTELLE für jeden Konsumenten, der nur die
 * Daten will — dieselbe Teilung wie `aiComplete`/`aiCompleteDetailed`.
 */
export async function aiCompleteJson<T = unknown>(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<T> {
  return (await aiCompleteJsonDetailed<T>(event, prompt, options)).value
}

/**
 * DASSELBE JSON, PLUS DIE ZAHLEN, DIE DIE RECHNUNG ERKLÄREN (2026-11-09).
 *
 * `aiCompleteJson` kannte `promptTokens`/`completionTokens` schon — es hat sie
 * nur im ERFOLGSFALL weggeworfen und nur beim Scheitern ins Log geschrieben.
 * Genau verkehrt: ein gescheiterter Lauf kostet einmal, ein erfolgreicher
 * läuft im Betrieb hundertmal. Wer wissen will, was eine Route kostet, bekam
 * deshalb nur eine Schätzung, obwohl der Anbieter die Zahl mitgeschickt hat
 * (gemessen am 2026-11-09: der K6-Entwurf lieferte 827 Wörter gegen 700
 * bestellte — die Abweichung war nachrechenbar, der Preis nicht).
 *
 * `value` statt `content`, weil hier Daten herauskommen und kein Text; der
 * Rest ist `AiCompletion` ohne das Feld, das schon geparst wurde.
 */
export interface AiJsonCompletion<T> extends Omit<AiCompletion, 'content'> {
  value: T
}

export async function aiCompleteJsonDetailed<T = unknown>(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<AiJsonCompletion<T>> {
  const label = options.label ?? 'core'
  const completion = await aiCompleteDetailed(event, prompt, options)
  const parsed: ModelJsonResult<T> | null = parseModelJson<T>(completion.content)

  if (parsed) {
    if (parsed.repaired) {
      // Kein Fehler, aber eine Zahl, die man sehen will: steigt sie, lohnt
      // ein Blick auf den Prompt (BI4 hat ihm das Anführungszeichen beigebracht).
      console.warn(`[${label}] KI-Antwort war erst nach Reparatur JSON (${completion.completionTokens} Tokens)`)
    }
    return {
      value: parsed.value,
      finishReason: completion.finishReason,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
    }
  }

  // Ab hier ist der Lauf bezahlt und nichts zu retten. Die EINE Frage, die
  // dem Menschen weiterhilft: hat das Modell aufgehört, weil es fertig war,
  // oder weil die Decke gerissen ist?
  if (completion.finishReason === 'length') {
    console.error(`[${label}] KI-Antwort an der Token-Decke abgeschnitten (${completion.completionTokens} Tokens)`)
    throw createError({
      status: 502,
      statusText: 'AI response truncated',
      data: { code: AI_TRUNCATED_CODE },
    })
  }

  console.error(`[${label}] KI-Antwort war kein JSON (finish_reason=${completion.finishReason || 'unbekannt'}): ${completion.content.slice(0, 300)}`)
  throw createError({ status: 502, statusText: 'AI returned no JSON' })
}
