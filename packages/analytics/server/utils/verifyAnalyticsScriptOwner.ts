import { isPlausibleScriptId, plausibleScriptUrl } from '../../../core/shared/analyticsScript'
import { createMicrocache } from '../../../core/server/utils/microcache'
import { scriptBelongsToCommunity, scriptSiteDomain } from '../../shared/analyticsScriptOwner'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * GEHÖRT DIESE ZÄHL-KENNUNG ZUR EIGENEN SEITE? (BE-022)
 *
 * Holt die öffentliche Zähl-Datei `<instanz>/js/<kennung>.js` und vergleicht
 * die Adresse darin mit den Adressen der Community. Die Regeln (Format der
 * Datei, Vergleich) stehen pur in `shared/analyticsScriptOwner.ts`.
 *
 * DIE ADRESSE DES ABRUFS kommt ausschließlich aus der Instanz-Basis der
 * App-Config und der bereits per `isPlausibleScriptId` geprüften Kennung —
 * dieselbe Regel, die auch den `<script src>` im Kopf baut
 * (`plausibleScriptUrl`). Der Zeichenvorrat der Kennung kennt weder `.` noch
 * `/` noch `:`; aus einer Eingabe kann also keine andere Adresse werden.
 *
 * DER ABRUF ist eng gehalten: 5 s Zeitlimit (auch für das Lesen), keine
 * Umleitung (`redirect: 'error'`), keine Zugangsdaten, höchstens ~200 KB —
 * die Datei ist ein paar KB groß, alles darüber ist nicht das, was wir suchen.
 *
 * ERGEBNIS als Zustand, die Route macht daraus die Antwort:
 *   own          die Datei nennt eine eigene Adresse
 *   foreign      sie nennt eine andere
 *   unknown      die Instanz kennt die Kennung nicht (404)
 *   unavailable  nicht prüfbar — kein Instanz-Wert, keine eigene Adresse,
 *                Netzfehler, Zeitlimit, anderer Status, zu groß, keine oder
 *                mehrdeutige Adresse in der Datei. Die Route lehnt dann ab
 *                (Davids Grundsatz „Eine Sicherung, die nicht prüfen kann,
 *                lehnt ab").
 */
export type AnalyticsScriptOwnerCheck = 'own' | 'foreign' | 'unknown' | 'unavailable'

const CHECK_TIMEOUT_MS = 5_000
const MAX_SCRIPT_BYTES = 200_000

/** Liest höchstens `limit` Bytes; `null`, sobald es mehr werden. */
async function readLimited(response: Response, limit: number): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(softFail('analytics:utils/verifyAnalyticsScriptOwner:cancel', undefined))
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function unavailable(reason: string): 'unavailable' {
  // Der Grund gehört ins Server-Log, nicht in die Antwort: dort hilft er beim
  // Nachsehen, draußen verriete er etwas über die Instanz.
  console.warn(`[analytics] Zähl-Kennung nicht prüfbar: ${reason}`)
  return 'unavailable'
}

/** Was die Zähl-Datei einer Kennung über ihre Seite sagt. */
export type AnalyticsScriptSite = { domain: string } | 'unknown' | 'unavailable'

/**
 * Die Adresse, unter der die Instanz diese Kennung führt — gelesen aus ihrer
 * öffentlichen Zähl-Datei (`<instanz>/js/<id>.js`). EIN Abruf für zwei Leser:
 * die Prüfung beim Speichern (`verifyAnalyticsScriptOwner`) und das Ziel der
 * Zahlen-Abfrage (`resolveOwnScriptSite`, KK1).
 */
export async function readAnalyticsScriptSite(instance: string | undefined, scriptId: string): Promise<AnalyticsScriptSite> {
  if (!scriptId || !isPlausibleScriptId(scriptId)) return unavailable('Kennung ohne gültige Form')

  const url = plausibleScriptUrl(instance, scriptId)
  if (!url) return unavailable('keine Instanz in der App-Config')
  try {
    const protocol = new URL(url).protocol
    if (protocol !== 'https:' && protocol !== 'http:') return unavailable('Instanz ohne http(s)')
  }
  catch {
    return unavailable('Instanz ist keine Adresse')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (response.status === 404) return 'unknown'
    if (!response.ok) return unavailable(`Status ${response.status}`)

    const source = await readLimited(response, MAX_SCRIPT_BYTES)
    if (source === null) return unavailable('Datei zu groß')

    const domain = scriptSiteDomain(source)
    if (!domain) return unavailable('keine eindeutige Adresse in der Datei')

    return { domain }
  }
  catch (error) {
    return unavailable(controller.signal.aborted ? 'Zeitlimit' : `Abruf gescheitert (${(error as Error)?.name ?? 'Fehler'})`)
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function verifyAnalyticsScriptOwner(
  instance: string | undefined,
  scriptId: string,
  ownHosts: string[],
): Promise<AnalyticsScriptOwnerCheck> {
  const hosts = ownHosts.filter(Boolean)
  if (hosts.length === 0) return unavailable('kein eigener Host')

  const site = await readAnalyticsScriptSite(instance, scriptId)
  if (site === 'unknown' || site === 'unavailable') return site
  return scriptBelongsToCommunity(site.domain, hosts) ? 'own' : 'foreign'
}

/** So lange gilt eine gelesene Adresse — sie ändert sich praktisch nie. */
const OWN_SITE_TTL_MS = 10 * 60_000
const ownSiteCache = createMicrocache<string | null>(OWN_SITE_TTL_MS)

/** Nur für Tests: den Zwischenspeicher der gelesenen Adressen leeren. */
export function __resetOwnScriptSiteCache(): void {
  ownSiteCache.clear()
}

/**
 * UNTER WELCHER ADRESSE LIEGEN DIE ZAHLEN DER EIGENEN KENNUNG? (KK1, 2026-11-17)
 *
 * Die Zahlen-Seite fragte bisher immer den HOST DER ANFRAGE. Liegt die Seite
 * in Plausible unter der Schwester-Adresse (mit oder ohne `www`), nahm das
 * Speichern die Kennung an (der Vergleich dort ignoriert ein führendes
 * `www.`), die Zahlen-Seite sagte aber „gerade nicht erreichbar". Jetzt nimmt
 * sie die Adresse, die die Zähl-Datei selbst nennt.
 *
 * NUR EINE EIGENE ADRESSE WIRD ZUM ZIEL: nennt die Datei eine fremde Seite
 * (eine Kennung aus der Zeit vor der Prüfung beim Speichern), bleibt es beim
 * Host der Anfrage — der trifft dann nichts, nie fremde Zahlen. Dasselbe bei
 * „unbekannt" und bei jedem Lesefehler: `null` heißt „wie bisher".
 *
 * Gehalten wird die GELESENE Adresse je Instanz und Kennung (zehn Minuten;
 * auch „unbekannt"), nie ein Lesefehler. Ob sie zur Community gehört, wird
 * bei jedem Aufruf neu entschieden — die eigenen Adressen hängen an der
 * Anfrage, nicht an der Kennung.
 */
export async function resolveOwnScriptSite(
  instance: string | undefined,
  scriptId: string,
  ownHosts: string[],
): Promise<string | null> {
  const hosts = ownHosts.filter(Boolean)
  if (hosts.length === 0 || !scriptId) return null

  const key = `${instance ?? ''}\u0000${scriptId}`
  let domain = ownSiteCache.get(key)
  if (domain === undefined) {
    const site = await readAnalyticsScriptSite(instance, scriptId)
    if (site === 'unavailable') return null
    domain = site === 'unknown' ? null : site.domain
    ownSiteCache.set(key, domain)
  }
  return domain && scriptBelongsToCommunity(domain, hosts) ? domain : null
}
