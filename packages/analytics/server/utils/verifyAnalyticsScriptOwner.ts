import { isPlausibleScriptId, plausibleScriptUrl } from '../../../core/shared/analyticsScript'
import { scriptBelongsToCommunity, scriptSiteDomain } from '../../shared/analyticsScriptOwner'

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
      await reader.cancel().catch(() => {})
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

function unavailable(reason: string): AnalyticsScriptOwnerCheck {
  // Der Grund gehört ins Server-Log, nicht in die Antwort: dort hilft er beim
  // Nachsehen, draußen verriete er etwas über die Instanz.
  console.warn(`[analytics] Zähl-Kennung nicht prüfbar: ${reason}`)
  return 'unavailable'
}

export async function verifyAnalyticsScriptOwner(
  instance: string | undefined,
  scriptId: string,
  ownHosts: string[],
): Promise<AnalyticsScriptOwnerCheck> {
  const hosts = ownHosts.filter(Boolean)
  if (hosts.length === 0) return unavailable('kein eigener Host')
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

    return scriptBelongsToCommunity(domain, hosts) ? 'own' : 'foreign'
  }
  catch (error) {
    return unavailable(controller.signal.aborted ? 'Zeitlimit' : `Abruf gescheitert (${(error as Error)?.name ?? 'Fehler'})`)
  }
  finally {
    clearTimeout(timeout)
  }
}
