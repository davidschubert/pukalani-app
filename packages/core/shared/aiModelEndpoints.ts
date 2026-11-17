import { AI_TEXT_EU_ENDPOINTS } from './aiProviderRouting'

/**
 * HAT EIN KI-MODELL EINEN DER ZWEI EUROPA-ENDPUNKTE? — die Deutung, pur
 * (KI1 c, 2026-11-17).
 *
 * Der Text-Transport bindet jeden Aufruf an `AI_TEXT_EU_ENDPOINTS` (P17). Ein
 * Modell ohne einen dieser Endpunkte läuft deshalb gar nicht: der erste
 * Aufruf scheitert mit 503 `ai_endpoint_unavailable`. Bisher erfuhr der
 * Betreiber das erst dort, wenn er ein Modell auf der Config-Seite (oder in
 * den Board-Einstellungen der Tickets) eingetragen hatte. Jetzt wird beim
 * SPEICHERN gefragt — mit derselben Auskunft und derselben Deutung wie der
 * tägliche Wächter `scripts/ops/verify-ai-models.mjs`: die öffentliche
 * Endpunkt-Liste des Vermittlers (ohne Schlüssel), daraus `data.endpoints[].tag`,
 * und EINER der verlangten Orte genügt (`provider.only` ist eine Allowlist).
 * `packages/core/tests/aiModelEndpoints.test.ts` hält beide aneinander.
 *
 * Den Netz-Teil (Frist, Protokoll) trägt `server/utils/aiModelCheck.ts`;
 * hier steht nur, was eine Antwort BEDEUTET — ohne Nitro, damit Tests und
 * Oberfläche die Werte relativ importieren können.
 */

/** Die Basis-Adresse des Vermittlers, für die diese Prüfung gilt. */
export const AI_BROKER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Vier Ausgänge:
 *  · `ok` — mindestens einer der zwei Orte ist da;
 *  · `no_eu_endpoint` — der Vermittler kennt das Modell, keiner der Orte ist dabei;
 *  · `unknown_model` — der Vermittler kennt den Slug nicht (404);
 *  · `unverified` — keine Aussage möglich (Frist, Netz, 5xx/429, unlesbare
 *    Antwort, oder die Basis-Adresse ist nicht der bekannte Vermittler).
 */
export type AiModelCheck = 'ok' | 'no_eu_endpoint' | 'unknown_model' | 'unverified'

/** Fachliche Gründe (`data.code` ⇒ `reason`) für ein abgelehntes Speichern. */
export const AI_MODEL_NO_EU_ENDPOINT_CODE = 'ai_model_no_eu_endpoint'
export const AI_MODEL_UNKNOWN_CODE = 'ai_model_unknown'

/** Ist die konfigurierte Basis-Adresse der Vermittler, dessen Liste wir lesen? */
export function isKnownAiBroker(baseUrl: string): boolean {
  return baseUrl.trim().replace(/\/+$/, '') === AI_BROKER_BASE_URL
}

/**
 * Adresse der Endpunkt-Liste je Modell — dieselbe wie `ENDPOINTS_URL` im
 * Wächter. Der Slug ist schon über das Schema der Route auf `vendor/model`
 * begrenzt; die zwei Teile werden trotzdem einzeln kodiert.
 */
export function aiModelEndpointsUrl(slug: string): string {
  const path = slug.split('/').map(part => encodeURIComponent(part)).join('/')
  return `${AI_BROKER_BASE_URL}/models/${path}/endpoints`
}

/** Die Endpunkt-Tags aus der Antwort — `null`, wenn die Antwort diese Form nicht hat. */
export function readEndpointTags(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const endpoints = (data as { endpoints?: unknown }).endpoints
  if (!Array.isArray(endpoints)) return null
  return endpoints
    .map(entry => (entry && typeof entry === 'object' ? (entry as { tag?: unknown }).tag : undefined))
    .filter((tag): tag is string => typeof tag === 'string')
}

/**
 * Deutung einer gelesenen Antwort. `body` ist das geparste JSON (`undefined`,
 * wenn es nicht lesbar war). 404 heißt „Modell unbekannt"; jeder andere
 * Nicht-2xx-Status sagt nichts über das Modell.
 */
export function interpretAiModelEndpoints(status: number, body: unknown): AiModelCheck {
  if (status === 404) return 'unknown_model'
  if (status < 200 || status >= 300) return 'unverified'
  const tags = readEndpointTags(body)
  if (tags === null) return 'unverified'
  return AI_TEXT_EU_ENDPOINTS.some(tag => tags.includes(tag)) ? 'ok' : 'no_eu_endpoint'
}

/** Lehnt dieser Ausgang das Speichern ab? Dann der fachliche Grund, sonst `null`. */
export function aiModelCheckRejection(check: AiModelCheck): string | null {
  if (check === 'no_eu_endpoint') return AI_MODEL_NO_EU_ENDPOINT_CODE
  if (check === 'unknown_model') return AI_MODEL_UNKNOWN_CODE
  return null
}
