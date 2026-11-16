/**
 * Die Form einer Plausible-Script-Id — und die EINE Regel, wie daraus eine
 * Script-Adresse wird.
 *
 * WARUM IM CORE UND NICHT IM analytics-LAYER: gerendert wird der Eintrag hier
 * (app/plugins/analytics.ts), geprüft wird die Eingabe dort. Zwei Kopien
 * derselben Regel wären genau der Zustand, in dem das Dashboard eine Vorschau
 * zeigt, die der Head später anders baut. Der Produkt-Layer importiert diese
 * Datei (Fundament → erlaubt, A14); umgekehrt kennt der Core den Layer nie.
 *
 * WARUM ÜBERHAUPT EINE ID UND KEINE URL: der Wert landet als `<script src>` in
 * JEDER Seite einer Kunden-Community — auf einem Host, dessen Cookies unsere
 * Session tragen. Eine freie Adresse wäre die Erlaubnis, dort fremden Code
 * auszuführen. Der Zeichenvorrat unten kennt weder `.` noch `/` noch `:`, kann
 * also per Konstruktion keine fremde Herkunft benennen; die Basis-Adresse
 * kommt aus `pukalani.analytics.instance` (App-Config, nicht aus der Eingabe).
 */

/**
 * `pa-` + 8–80 URL-sichere Zeichen, oder '' (= Analytics aus).
 * Plausible v3 vergibt heute 21 Zeichen (nanoid); die Spanne lässt künftigen
 * Längen Luft, ohne die Form aufzuweichen.
 */
export const ANALYTICS_SCRIPT_ID_RE = /^$|^pa-[A-Za-z0-9_-]{8,80}$/

/** PURE (unit-getestet): ist das eine akzeptable Script-Id? ('' = ja, aus.) */
export function isPlausibleScriptId(value: unknown): value is string {
  return typeof value === 'string' && ANALYTICS_SCRIPT_ID_RE.test(value)
}

/**
 * PURE (unit-getestet): Script-Adresse aus Instanz-Basis + Id.
 *
 * '' zurück, sobald eines von beiden fehlt oder die Id nicht der Form
 * entspricht — der Aufrufer rendert dann NICHTS. Ein Rückfall auf eine
 * Vorgabe-Adresse wäre hier falsch: er würde beim leeren Feld stillschweigend
 * doch messen.
 */
export function plausibleScriptUrl(instance: string | undefined, scriptId: string | undefined): string {
  if (!instance || !scriptId) return ''
  if (!isPlausibleScriptId(scriptId)) return ''
  return `${instance.replace(/\/+$/, '')}/js/${scriptId}.js`
}

/**
 * ─── DER ADBLOCK-PROXY (F47/Paket 5, 2026-08-12) ──────────────────────────
 *
 * Zwei Pfade auf dem EIGENEN Host, über die Script und Ereignisse laufen. Der
 * Grund ist der einzige, den es dafür gibt: Filterlisten kennen die Adresse
 * jeder Plausible-Instanz, und ein guter Teil der Besucher wird damit nie
 * gezählt. Kommen Script und Ereignis vom selben Host wie die Seite, sind sie
 * von den eigenen Dateien nicht zu unterscheiden.
 *
 * DIE NAMEN SIND ABSICHT: nichts hier heißt „plausible", „analytics" oder
 * „track" — genau diese Wörter stehen in den Filterlisten, und ein Proxy unter
 * `/api/plausible.js` wäre eine Attrappe, die man sich hätte sparen können.
 * Wer sie umbenennt, hebt die Wirkung auf; es sind auch keine Namen, die je ein
 * Kunde lesen muss.
 */
export const ANALYTICS_PROXY_SCRIPT_PATH = '/api/stats-script.js'
export const ANALYTICS_PROXY_EVENT_PATH = '/api/stats-event'

/** Die Provider-Voreinstellungen, wenn `src` leer ist (Plugin `analytics.ts`). */
export const UMAMI_DEFAULT_SCRIPT_URL = 'https://cloud.umami.is/script.js'
export const PLAUSIBLE_DEFAULT_SCRIPT_URL = 'https://plausible.io/js/script.js'

/**
 * PURE (unit-getestet): von welchen FREMDEN Origins das Analytics-Plugin ein
 * Skript laden kann — für die beobachtende Skript-CSP (SEC-006).
 *
 * Absichtlich großzügig: jede Herkunft, die einer der Zweige im Plugin
 * benutzen KANN (eigenes `src`, die Selbstbedienungs-`instance`, die
 * Provider-Voreinstellung). Die CSP beobachtet nur; eine Herkunft zu viel
 * kostet nichts, eine zu wenig meldete die eigene Messung als Fremdkörper.
 * Der Proxy-Weg (`/api/stats-script.js`) ist `'self'` und braucht keinen
 * Eintrag. Gate aus ⇒ nichts, weil dann kein Byte geladen wird.
 */
export function analyticsScriptOrigins(
  analytics: { enabled?: boolean, provider?: string, src?: string, instance?: string } | null | undefined,
): string[] {
  if (analytics?.enabled !== true) return []
  const candidates = [analytics.src, analytics.instance]
  if (!analytics.src) {
    candidates.push(analytics.provider === 'umami' ? UMAMI_DEFAULT_SCRIPT_URL : PLAUSIBLE_DEFAULT_SCRIPT_URL)
  }
  const origins: string[] = []
  for (const value of candidates) {
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' || url.protocol === 'http:') origins.push(url.origin)
    }
    catch {
      // Keine absolute Adresse (z. B. ein Pfad auf dem eigenen Host) — `'self'` deckt sie.
    }
  }
  return [...new Set(origins)]
}

/**
 * PURE (unit-getestet): die Basis-Adresse unserer Plausible-Instanz, wie sie
 * aus der App-Config folgt — die einzige Herkunft, die der Proxy anfragen darf.
 *
 * ZWEI HERKÜNFTE, dieselben zwei wie beim Script-Tag selbst:
 *  1. `instance` (Selbstbedienung, platform) steht schon als Basis da.
 *  2. Sonst wird sie aus dem statischen `src` zurückgerechnet (marketing,
 *     comments, portfolio haben nur den) — alles VOR `/js/`.
 *
 * `''`, wenn nichts Brauchbares dasteht. Die Prüfung auf `http(s)://` ist kein
 * Zierrat: dieser Wert wird zur Ziel-Adresse eines server-seitigen `fetch`. Er
 * kommt heute aus der App-Config und nie aus einer Anfrage — genau das soll
 * auch dann noch gelten, wenn ihn eines Tages eine Env-Variable setzt.
 */
export function analyticsUpstreamBase(
  analytics: { instance?: string, src?: string } | null | undefined,
): string {
  const instance = normalizeUpstreamBase(analytics?.instance)
  if (instance) return instance

  const src = analytics?.src ?? ''
  const cut = src.indexOf('/js/')
  return cut > 0 ? normalizeUpstreamBase(src.slice(0, cut)) : ''
}

/** Trailing-Slashes weg — und nur echte http(s)-Adressen kommen durch. */
function normalizeUpstreamBase(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+$/i.test(trimmed) ? trimmed : ''
}

/**
 * PURE (unit-getestet): die Script-Id aus einer fertigen Script-Adresse
 * zurückgewinnen (`…/js/pa-xyz.js` → `pa-xyz`).
 *
 * Gebraucht, weil drei Apps ihre Site als VOLLE URL in der Config stehen haben,
 * der Proxy aber eine Id braucht — die Upstream-Adresse baut er selbst.
 *
 * Das Ergebnis läuft durch dieselbe Formprüfung wie eine Kunden-Eingabe. Beim
 * LEGACY-Script (`…/js/script.js`) fällt es damit auf `''`: dessen Id ist keine
 * `pa-…`-Id, und das alte Snippet wird von dieser Umstellung bewusst nicht
 * mitgenommen (es benutzt `data-domain`/`data-api`, einen anderen Mechanismus).
 */
export function scriptIdFromUrl(src: string | undefined | null): string {
  const id = /\/js\/([^/?#]+)\.js(?:[?#]|$)/.exec(src ?? '')?.[1] ?? ''
  return id && isPlausibleScriptId(id) ? id : ''
}

/**
 * PURE (unit-getestet): WELCHE Id gehört in den Head dieses Seitenaufbaus?
 *
 * Dieselbe Rangfolge wie überall — die Zeile der Community (Selbstbedienung)
 * schlägt die gebaute Config. `effectiveScriptId` hat die erste Hälfte dieser
 * Frage schon in der Route beantwortet; hier kommt nur der statische Fall dazu.
 */
export function headScriptId(
  analytics: { src?: string } | null | undefined,
  selfServiceId: string | undefined,
): string {
  if (selfServiceId && isPlausibleScriptId(selfServiceId)) return selfServiceId
  return scriptIdFromUrl(analytics?.src)
}

/**
 * PURE (unit-getestet): die Script-Adresse AUF DEM EIGENEN HOST — oder `''`,
 * wenn es keine gültige Id gibt.
 *
 * `''` ist der Sicherheitsgurt dieser ganzen Umstellung: der Aufrufer fällt
 * dann auf die direkte Adresse zurück. Der Proxy kann eine laufende Messung
 * damit nicht kaputtmachen — er schaltet sich nur dazu, wenn alles stimmt.
 *
 * Die Id steht im Query und braucht kein Encoding: ihr Zeichenvorrat
 * (`ANALYTICS_SCRIPT_ID_RE`) ist URL-sicher, und was ihm nicht entspricht,
 * kommt hier gar nicht erst durch.
 */
export function proxiedScriptSrc(scriptId: string | undefined): string {
  if (!scriptId || !isPlausibleScriptId(scriptId)) return ''
  return `${ANALYTICS_PROXY_SCRIPT_PATH}?id=${scriptId}`
}

/** Die gespeicherte Einstellung EINER Community — nur, was hier zählt. */
export interface AnalyticsSettingsLike {
  /** Eigene Plausible-Site der Community ('' = keine). */
  plausibleScriptId?: string
  /** Schalter „Messung aktiv" (v2) — zielt auf die Sammel-Site. */
  enabled?: boolean
}

/** Die Sammel-Site des Deployments (`pukalani.analytics.shared`). */
export interface AnalyticsSharedSite {
  /** Script-Id der Sammel-Site ('' = dieses Deployment hat keine). */
  scriptId?: string
}

/**
 * PURE (unit-getestet): WELCHE Script-Id lädt diese Community wirklich?
 *
 * Zwei Wege führen zur Messung, und sie schließen einander nicht aus — deshalb
 * braucht es eine Rangfolge, und zwar an EINER Stelle (der Head-Eintrag, die
 * Dashboard-Vorschau und die Statistik müssen dasselbe rechnen):
 *
 *  1. EIGENE SITE (`plausibleScriptId`, das v1-Feld, im Dashboard unter
 *     „Erweitert") GEWINNT IMMER. Sie ist die spezifischere Aussage: wer sich
 *     die Mühe einer eigenen Plausible-Site macht, will seine Zahlen für sich
 *     — nicht zusätzlich, sondern STATT der Sammel-Site. Zwei Scripts auf
 *     derselben Seite wären außerdem doppelt gezählte Besuche.
 *  2. Sonst der SCHALTER: `enabled` an UND das Deployment hat eine Sammel-Site.
 *     Ohne Sammel-Site (Silo, lokale Entwicklung) ist der Schalter wirkungslos
 *     — es gäbe keine Site, in die gemessen werden könnte.
 *  3. Sonst nichts. Kein Rückfall auf irgendeine Vorgabe: „aus" heißt aus.
 *
 * WARUM DIE SAMMEL-SITE ÜBERHAUPT (2026-08-04): die Plausible-CE hat keine
 * Sites-API (Enterprise-only, am Quellcode geprüft) — wir können pro Community
 * keine Site anlegen lassen. Also tracken alle Pool-Communities in EINE Site,
 * und die Zahlen je Community holt unsere Stats-Route über den
 * `event:hostname`-Filter. Die Trennung ist damit eine ABFRAGE-Grenze, keine
 * Speicher-Grenze — das ist der bewusst gezahlte Preis dieser Bauweise.
 *
 * Beide Ids laufen durch `isPlausibleScriptId`: der Rückgabewert wird zu einem
 * `<script src>`, und das gilt auch für einen Wert aus der App-Config.
 */
export function effectiveScriptId(
  row: AnalyticsSettingsLike | null | undefined,
  shared: AnalyticsSharedSite,
): string {
  const own = row?.plausibleScriptId ?? ''
  if (own && isPlausibleScriptId(own)) return own

  const sharedId = shared.scriptId ?? ''
  if (row?.enabled === true && sharedId && isPlausibleScriptId(sharedId)) return sharedId

  return ''
}
