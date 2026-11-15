/**
 * DIE BINDUNG JEDES KI-TEXTAUFRUFS — EINE Quelle (P17, SEC-005, 2026-11-15).
 *
 * Der Text-Transport (`aiComplete*`, `aiCompleteStream`) sendet diese vier
 * Zusagen SELBST; keine Aufrufstelle muss daran denken, keine kann sie
 * weglassen:
 *   · `zdr: true` — nur Anbieter, die nichts speichern (Zero-Data-Retention);
 *   · `dataCollection: 'deny'` — kein Sammeln fürs Training;
 *   · `allowFallbacks: false` — kein Ausweichen auf einen Anbieter ausserhalb
 *     dieser Bedingungen;
 *   · `only` — der ORT: die zwei EU-Endpunkte des Textmodells.
 *
 * `zdr` sagt NICHTS darüber, WO gerechnet wird; das tut erst `only` (AI1,
 * 2026-11-09 gemessen). Der Orts-Pin kostet rund 10 % Aufschlag gegenüber den
 * ortlosen Endpunkten. Und er ist eine Bedingung an die MODELLWAHL: ein Modell
 * ohne einen dieser Endpunkte läuft nicht langsamer, sondern gar nicht (404
 * beim Vermittler ⇒ 503 `ai_endpoint_unavailable`). Geprüft wird das je
 * konfiguriertem Modell von `pnpm ops:ai-models`.
 *
 * Pur und ohne Nitro, damit Layer, Tests, Wächter und Client die Werte
 * relativ importieren können.
 */
export const AI_TEXT_EU_ENDPOINTS = ['amazon-bedrock/eu-west-1', 'google-vertex/europe'] as const

export const AI_TEXT_PROVIDER_ROUTING = {
  zdr: true,
  dataCollection: 'deny',
  allowFallbacks: false,
  only: AI_TEXT_EU_ENDPOINTS,
} as const

/** Fachlicher Grund (`data.code` ⇒ `reason`): unter der Bindung ist kein Endpunkt erreichbar. */
export const AI_ENDPOINT_UNAVAILABLE_CODE = 'ai_endpoint_unavailable'

/**
 * Zeigt der zentrale Fehler-Leser im Browser den Hinweis? Nur für genau
 * diesen Grund und Status — ein 503 ohne Grund („kein Schlüssel") ist eine
 * andere Lage und hat seine eigenen Sätze.
 */
export function aiEndpointNoticeApplies(notice: { status: number, reason: string }): boolean {
  return notice.status === 503 && notice.reason === AI_ENDPOINT_UNAVAILABLE_CODE
}

/**
 * Fachlicher Grund (`data.code` ⇒ `reason`): ein angemeldeter Abschalter sagt
 * „aus" (`aiKillSwitch.ts`, P17 BE-006). Derselbe Code, den insights und market
 * für ihren eigenen Schalter schon benutzen — die Bedeutung ist dieselbe.
 */
export const AI_DISABLED_CODE = 'ai_disabled'
