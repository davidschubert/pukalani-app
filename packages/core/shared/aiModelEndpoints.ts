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
 * ZWEI LISTEN, EINE AUSSAGE (seit 2026-11-18): der Vermittler führt die
 * Europa-Endpunkte mit Aufpreis nicht mehr in der Liste seiner weltweiten
 * Adresse, sondern nur noch in der seiner Europa-Adresse — dieselben Namen,
 * und ein Aufruf über die weltweite Adresse erreicht sie weiter, sobald
 * `provider.only` sie nennt (gemessen: 200, abgerechnet zum Europa-Preis).
 * Wer nur die weltweite Liste liest, hält seitdem jedes Modell von Anthropic
 * und Google für „ohne Europa-Endpunkt". Gelesen werden deshalb BEIDE Listen,
 * und ein Ort zählt, sobald er in EINER steht. Die Europa-Adresse wird nur
 * GELESEN; die Aufrufe selbst gehen weiter an die eine Basis-Adresse.
 *
 * Den Netz-Teil (Frist, Protokoll) trägt `server/utils/aiModelCheck.ts`;
 * hier steht nur, was eine Antwort BEDEUTET — ohne Nitro, damit Tests und
 * Oberfläche die Werte relativ importieren können.
 */

/** Die Basis-Adresse des Vermittlers, für die diese Prüfung gilt. */
export const AI_BROKER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * Die Europa-Adresse desselben Vermittlers — hier NUR zum Lesen der
 * öffentlichen Endpunkt-Liste. Kein Aufruf eines Modells geht dorthin.
 */
export const AI_BROKER_EU_BASE_URL = 'https://eu.openrouter.ai/api/v1'

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
  return `${AI_BROKER_BASE_URL}/models/${encodeModelSlug(slug)}/endpoints`
}

/** Dieselbe Liste auf der Europa-Adresse — wie `EU_ENDPOINTS_URL` im Wächter. */
export function aiModelEuEndpointsUrl(slug: string): string {
  return `${AI_BROKER_EU_BASE_URL}/models/${encodeModelSlug(slug)}/endpoints`
}

function encodeModelSlug(slug: string): string {
  return slug.split('/').map(part => encodeURIComponent(part)).join('/')
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

/** Eine gelesene Antwort einer der zwei Listen: Status und geparstes JSON. */
export interface AiModelEndpointAnswer {
  status: number
  /** `undefined`, wenn der Rumpf nicht lesbar war. */
  body: unknown
}

/**
 * Deutung der zwei gelesenen Antworten — `null` heißt „keine Antwort" (Frist,
 * Netz).
 *  · Die weltweite Liste kennt den Slug nicht (404) ⇒ `unknown_model`.
 *  · Einer der zwei Orte steht in EINER lesbaren Liste ⇒ `ok`.
 *  · BEIDE Listen lesbar, keiner der Orte dabei ⇒ `no_eu_endpoint`.
 *  · sonst ⇒ `unverified`. Fehlt eine der zwei Listen, ist „kein Ort" keine
 *    Aussage über das Modell: die fehlende könnte ihn tragen.
 */
export function interpretAiModelEndpoints(
  global: AiModelEndpointAnswer | null,
  eu: AiModelEndpointAnswer | null,
): AiModelCheck {
  if (global?.status === 404) return 'unknown_model'
  const lists = [global, eu].map(answer =>
    answer && answer.status >= 200 && answer.status < 300 ? readEndpointTags(answer.body) : null)
  if (lists.some(tags => tags !== null && AI_TEXT_EU_ENDPOINTS.some(tag => tags.includes(tag)))) return 'ok'
  return lists.every(tags => tags !== null) ? 'no_eu_endpoint' : 'unverified'
}

/** Lehnt dieser Ausgang das Speichern ab? Dann der fachliche Grund, sonst `null`. */
export function aiModelCheckRejection(check: AiModelCheck): string | null {
  if (check === 'no_eu_endpoint') return AI_MODEL_NO_EU_ENDPOINT_CODE
  if (check === 'unknown_model') return AI_MODEL_UNKNOWN_CODE
  return null
}
