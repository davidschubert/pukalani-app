/**
 * DIE TABELLEN DES KI-MODELL-WÄCHTERS — als Daten, ohne Seiteneffekt.
 *
 * Gelesen von `scripts/ops/verify-ai-models.mjs` (der Wächter selbst) UND von
 * `packages/brand/tests/aiModelEndpoints.test.ts`. Der Test bindet
 * `REQUIRED_ENDPOINT` an die Routing-Konstanten in
 * `packages/brand/server/utils/brandProviderRouting.ts` — bis zum 2026-11-13
 * war diese Tabelle eine bloße Verabredung („MITFÜHREN, wenn sich das Pinning
 * ändert"), und genau dort fehlte `imageModel`: die Zeichen-Entwürfe pinnten
 * über die Basis auf zwei EU-Endpunkte, die das Bildmodell nicht hat, und der
 * Wächter blieb grün (Finding BE-004). Jetzt wird ein Auseinanderlaufen rot.
 *
 * Bewusst KEIN Import aus dem TypeScript der Pakete: das Skript läuft mit
 * nacktem `node`, ohne Build und ohne Lader. Die Werte stehen deshalb hier
 * wörtlich, und der Test hält sie an den Code.
 */

/**
 * Felder, die einen Modell-Slug tragen. Ein NEUES Modell-Feld gehört hier
 * hinein, sonst ist es ungedeckt — dieselbe Regel wie bei der
 * `FIELDS`-Tabelle von `check-i18n-keys.mjs`.
 */
export const MODEL_FIELDS = [
  'model',
  'visionModel',
  'imageModel',
  'videoModel',
  'reviewModel',
  'ticketsAiModel',
  // Seit AI1 mitgeprüft: beide waren LEER und damit unsichtbar, aber sie sind
  // echte Konfigurationsfelder (`pukalani.market.ai`) und gehen über
  // `BRAND_PROVIDER_ROUTING` — ein dort eingetragener Slug ohne EU-Endpunkt
  // wäre ein 404 ohne Wächter.
  'extractModel',
  'reportModel',
]

/**
 * FELDER, DIE EINE LISTE TRAGEN. `outsideViewModels` ist das einzige heute:
 * die KI-Aussensicht des Marktvergleichs verlangt zwei Modelle VERSCHIEDENER
 * Anbieter, und der Kopf von `packages/market/app/app.config.ts` lädt dazu
 * ein. Ein Wächter, der nur `feld: '…'` kennt, hätte genau diese Einladung
 * nicht gesehen.
 */
export const MODEL_LIST_FIELDS = ['outsideViewModels']

/**
 * Die zwei EU-Endpunkte des Textweges — `BRAND_PROVIDER_ROUTING.only`
 * (Davids Entscheidung 2026-11-09, AI1).
 */
export const TEXT_EU_ENDPOINTS = ['amazon-bedrock/eu-west-1', 'google-vertex/europe']

/**
 * WER EINEN ORT VERLANGT — und WELCHE Orte reichen.
 *
 * Der Wert ist eine LISTE, weil `provider.only` eine Allowlist ist: der
 * Aufruf gelingt, sobald das Modell MINDESTENS EINEN dieser Endpunkte hat.
 * Eine Liste mit einem Eintrag ist deshalb die strengste Form, nicht die
 * schwächste — sie lässt genau eine Route zu.
 *
 * - `visionModel` / `videoModel` reichen Kundenmaterial hin und gehen über
 *   `BRAND_PROVIDER_ROUTING_VERTEX_EU` (`only: ['google-vertex/eu']`) —
 *   Davids Entscheidung 2026-10-27.
 * - `imageModel` (Zeichen-Entwürfe) geht über
 *   `BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL` (`only: ['google-vertex/global']`)
 *   — Davids Entscheidung 2026-11-13 „ohne festen Ort in Europa, wie
 *   bisher": das Bildmodell hat nur diesen einen Endpunkt, der Pin legt den
 *   Betreiber fest (Google Cloud Vertex AI), nicht einen Ort. Fehlte er hier
 *   (so bis 2026-11-13), sähe der Wächter einen toten Bildweg nie.
 * - Die TEXT-Felder gehen seit AI1 (Davids Entscheidung 2026-11-09) über die
 *   Basis `BRAND_PROVIDER_ROUTING` mit BEIDEN EU-Endpunkten des Textmodells.
 *   Für sie genügt „irgendwo ZDR" nicht mehr: ohne einen dieser zwei
 *   Endpunkte antwortet jeder Aufruf 404.
 *
 * NICHT HIER DRIN steht `ticketsAiModel` — die Ticket-Triage und der
 * Moderations-Assist geben GAR KEIN `providerRouting` mit (nachgeprüft
 * 2026-11-09), für sie ist also auch kein Ort verlangt. Ein Feld hier
 * einzutragen, dessen Aufrufer die Konstante nicht benutzt, würde einen
 * Zwang erfinden, den der Code nicht kennt.
 *
 * GEBUNDEN an `brandProviderRouting.ts` durch
 * `packages/brand/tests/aiModelEndpoints.test.ts`; dass jeder Aufrufer die
 * passende Konstante mitgibt, prüft `brandAiCallSites.test.ts`.
 */
export const REQUIRED_ENDPOINT = {
  visionModel: ['google-vertex/eu'],
  videoModel: ['google-vertex/eu'],
  imageModel: ['google-vertex/global'],
  model: TEXT_EU_ENDPOINTS,
  reviewModel: TEXT_EU_ENDPOINTS,
  extractModel: TEXT_EU_ENDPOINTS,
  reportModel: TEXT_EU_ENDPOINTS,
  outsideViewModels: TEXT_EU_ENDPOINTS,
}

/**
 * Ist ein Endpunkt-Tag ORTLOS? (`google-vertex/global`) — dann lohnt der
 * Blick, ob das Modell inzwischen einen EU-Endpunkt hat.
 */
export function isLocationlessEndpoint(tag) {
  return /\/global$/.test(tag)
}

/** Ist ein Endpunkt-Tag in der EU? (`…/eu`, `…/europe`, `…/eu-west-1`) */
export function isEuEndpoint(tag) {
  return /\/(eu|europe|eu-[a-z0-9-]+)$/.test(tag)
}
