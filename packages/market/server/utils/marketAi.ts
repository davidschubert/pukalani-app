import type { H3Event } from 'h3'

/**
 * DIE MODELLWAHL DES MARKTVERGLEICHS — und der Ersatz für die Entwicklung.
 *
 * ── DIE KETTE, UND WARUM SIE SO KURZ IST ──────────────────────────────────
 * `pukalani.market.ai.extractModel` mit dem Default aus dem brand-Layer
 * (`pukalani.brand.ai.reviewModel`, heute `anthropic/claude-haiku-4.5`). Kein
 * `app_config`-Zwischenschritt wie bei `getEffectiveAiConfig()`: der
 * Marktvergleich braucht keine Laufzeit-UMSCHALTUNG des Modells, wohl aber
 * eine Laufzeit-ABSCHALTUNG — und die hat er über `brandAiEnabled` (dasselbe
 * Flag, ein Kill-Switch für die ganze Instanz).
 *
 * Der Default zeigt auf die STUFE-1-Wahl des Wizards, weil die Aufgabe
 * dieselbe Klasse hat: viel Text lesen, eine JSON-Struktur füllen, kein
 * Formulieren. Und weil es das einzige Modell ist, von dem dieses Projekt
 * WEISS, dass es die ZDR-Bedingungen des `BRAND_PROVIDER_ROUTING` erfüllt —
 * mit `allowFallbacks: false` ist ein ungeprüftes Modell kein langsamerer
 * Lauf, sondern gar keiner (Begründung ausführlich in
 * `packages/brand/app/app.config.ts`).
 *
 * ── DIE AUSSENSICHT BRAUCHT ZWEI VERSCHIEDENE (§7.5 b) ────────────────────
 * `pukalani.market.ai.outsideViewModels` ist eine LISTE, und der Konsens-Filter
 * verlangt Übereinstimmung zwischen VERSCHIEDENEN Modellen. Steht dort nur
 * eines (oder zweimal dasselbe), gibt es keine Aussensicht — das ist kein
 * Fehler, sondern die Leitplanke: eine einzelne Modellantwort ist eine
 * Behauptung ohne Gegenprobe.
 */

interface MarketAiConfig {
  extractModel?: unknown
  reportModel?: unknown
  outsideViewModels?: unknown
}

function marketAiConfig(): MarketAiConfig {
  const config = useAppConfig() as { pukalani?: { market?: { ai?: MarketAiConfig } } }
  return config.pukalani?.market?.ai ?? {}
}

function brandReviewModel(): string {
  const config = useAppConfig() as { pukalani?: { brand?: { ai?: { reviewModel?: unknown } } } }
  const model = config.pukalani?.brand?.ai?.reviewModel
  return typeof model === 'string' ? model.trim() : ''
}

/** Das Modell der Extraktion — leer heisst „es ist keines eingestellt". */
export function marketExtractModel(): string {
  const configured = marketAiConfig().extractModel
  const model = typeof configured === 'string' ? configured.trim() : ''
  return model || brandReviewModel()
}

/**
 * Die Modelle der Aussensicht — entdoppelt, denn zwei Einträge desselben
 * Modells sind EIN Modell und würden aus dem Konsens eine Selbstbestätigung
 * machen.
 */
/**
 * DAS MODELL DES VERGLEICHS (MV1 M3, Plan §2.8: „1 Vergleich (George-Modell)").
 *
 * ── DIE KETTE, UND WARUM SIE SO HERUM LÄUFT ───────────────────────────────
 * `pukalani.market.ai.reportModel` (leer als Default) > DAS GEORGE-MODELL >
 * das Stufe-1-Modell des Spezialisten.
 *
 * Das George-Modell ist NICHT abgeschrieben, sondern gefragt:
 * `getEffectiveAiConfig` ist die bestehende Laufzeit-Kette des Core
 * (`app_config.aiModel > pukalani.ai.model`), aus der auch der Wizard sein
 * Gesprächsmodell nimmt (`advisorGenerator.ts`). Ein hier eingetragener
 * Modellname wäre eine zweite Wahrheit, die beim nächsten Wechsel stehen
 * bliebe — und weil `allowFallbacks: false` gilt, wäre ein ungeprüftes Modell
 * kein langsamerer Bericht, sondern gar keiner.
 *
 * Der Vergleich ist der EINE teure Aufruf je Lauf; er soll auf der Stufe
 * laufen, auf der auch das Gespräch läuft, nicht auf der günstigen der
 * Extraktion. Deshalb ist das Stufe-1-Modell hier nur der LETZTE Rückfall.
 *
 * ASYNC, weil die Laufzeit-Einstellung in der Datenbank steht — dieselbe
 * Eigenart wie bei `isAiConfigured`.
 */
export async function marketReportModel(event: H3Event): Promise<string> {
  const configured = marketAiConfig().reportModel
  const model = typeof configured === 'string' ? configured.trim() : ''
  if (model) return model
  const george = (await getEffectiveAiConfig(event)).model
  return (typeof george === 'string' ? george.trim() : '') || brandReviewModel()
}

export function marketOutsideViewModels(): string[] {
  const configured = marketAiConfig().outsideViewModels
  if (!Array.isArray(configured)) return []
  const models: string[] = []
  for (const entry of configured) {
    if (typeof entry !== 'string') continue
    const model = entry.trim()
    if (model && !models.includes(model)) models.push(model)
  }
  return models
}

/**
 * LÄUFT DER ENTWICKLUNGS-ERSATZ? (`MARKET_DEV_STUB=1`)
 *
 * Eine Umgebungsvariable und KEIN Config-Schalter, aus demselben Grund wie
 * `BRAND_DEV_STUB_REVIEW`: sie gehört zum Beweis-Aufruf und nicht zur App. Auf
 * einem Server ist sie nicht gesetzt, `ops:site-env` kennt sie nicht, und ein
 * Config-Feld wäre eine Einstellung, die jemand versehentlich deployt.
 *
 * Er ersetzt BEIDE Modell-Aufrufe (Extraktion und Aussensicht) — ein halber
 * Ersatz brauchte im Beweis trotzdem einen Schlüssel und wäre keiner.
 */
export function marketDevStubEnabled(): boolean {
  return process.env.MARKET_DEV_STUB === '1'
}
