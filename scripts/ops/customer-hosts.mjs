/**
 * Kundendomains für die Wächter (WA1 d, 2026-11-18).
 *
 * Die Host-Listen des TLS- und des Health-Wächters (`verify-tls.mjs`,
 * `verify-health.mjs`) sind von Hand gepflegt: eine neue Kundendomain stand
 * dort erst, wenn jemand sie eintrug. Dieses Modul liest die Liste ZUSÄTZLICH
 * aus dem Control Plane (`GET /api/control/watch/hosts`, Regel in
 * `packages/control/shared/watchHosts.ts`) — die feste Liste bleibt.
 *
 * VIER REGELN, alle mit Test (`packages/core/tests/customerHosts.test.ts`):
 *
 * 1. OHNE GEHEIMNIS ÄNDERT SICH NICHTS. Fehlt `PUKALANI_WATCH_HOSTS_SECRET`,
 *    antwortet die Route nicht oder hat ihre Antwort nicht die feste Form,
 *    prüft der Wächter seine feste Liste weiter und meldet das als EINE
 *    Zeile. Rot wird davon nichts: dass ein Geheimnis fehlt, ist kein Vorfall.
 *
 * 2. EIN HOST-NAME EINES KUNDEN STEHT NIE IM PROTOKOLL. Die Protokolle der
 *    GitHub-Läufe sind öffentlich. Eine Kundendomain heißt dort „Kundendomain
 *    3/5" (ihre Stelle in der nach Name sortierten Liste der Route); auch ein
 *    Befund nennt nur die Nummer, nie SAN-Einträge oder eine Fehlermeldung im
 *    Wortlaut (beides kann den Namen enthalten). DEN NAMEN gibt es an zwei
 *    privaten Stellen: in einer eigenen Mail an die Alarm-Adresse, wenn ein
 *    Alarm neu aufgeht (`customer-hosts-mail.mjs`, Job `kundendomains-namen`),
 *    und von Hand am eigenen Rechner mit `--namen` (in einem CI-Lauf wirkt
 *    der Schalter nicht).
 *
 * 3. ERST ZÄHLEN, DANN ALARM (`PUKALANI_CUSTOMER_HOSTS_MODE`). `count`
 *    (Vorgabe): ALLE Hosts der Route werden geprüft, ein Befund ist eine
 *    Zeile „Nur gezählt", der Lauf bleibt grün. `alarm`: geprüft werden die
 *    Hosts, die NICHT schon in der festen Liste stehen (die prüft der Job
 *    `tls`), ein Befund macht den Lauf rot.
 *
 * 4. DAS GEHEIMNIS REIST NUR VERSCHLÜSSELT. Eine andere Adresse als die
 *    Vorgabe (`PUKALANI_WATCH_HOSTS_URL`, für Proben) muss `https` sein —
 *    außer sie zeigt auf den eigenen Rechner.
 */

export const DEFAULT_URL = 'https://admin.pukalani.app/api/control/watch/hosts'
export const SECRET_HEADER = 'x-pukalani-watch-secret'
export const SECRET_ENV = 'PUKALANI_WATCH_HOSTS_SECRET'
export const URL_ENV = 'PUKALANI_WATCH_HOSTS_URL'
export const MODE_ENV = 'PUKALANI_CUSTOMER_HOSTS_MODE'
export const DRILL_ENV = 'PUKALANI_CUSTOMER_HOSTS_DRILL'
/** Mehr Kundendomains hat die Plattform auf lange Sicht nicht; der Deckel hält eine vergiftete Antwort klein. */
export const MAX_HOSTS = 500

/** Dieselbe Form wie `HOST_FORM` in `packages/control/shared/watchHosts.ts`. */
const HOST_FORM = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** Warum die Liste nicht gelesen wurde — ein Satzteil je Wort, ohne Namen und ohne Wortlaut einer Antwort. */
export const UNREAD_TEXT = {
  'kein-geheimnis': 'in diesem Lauf ist kein Geheimnis gesetzt',
  'adresse': `die Adresse in ${URL_ENV} ist nicht erlaubt (nur https, oder der eigene Rechner)`,
  'nicht-erreichbar': 'das Control Plane war nicht erreichbar',
  'abgelehnt': 'das Control Plane hat das Geheimnis abgelehnt (401)',
  'route-fehlt': 'die Route gibt es dort nicht (404 — auf der Site ist kein Geheimnis gesetzt, oder der Stand ist älter)',
  'fehler': 'das Control Plane hat mit einem Fehler geantwortet',
  'form': 'die Antwort hatte nicht die feste Form',
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** `count` (Vorgabe) oder `alarm` — jeder andere Wert ist `count`. */
export function customerMode(env = process.env) {
  return env[MODE_ENV] === 'alarm' ? 'alarm' : 'count'
}

/** Die Adresse der Route — oder `null`, wenn die überschriebene nicht erlaubt ist. */
export function watchHostsUrl(env = process.env) {
  const raw = (env[URL_ENV] ?? '').trim()
  if (!raw) return DEFAULT_URL
  let url
  try {
    url = new URL(raw)
  }
  catch {
    return null
  }
  if (url.protocol === 'https:') return url.href
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.href
  return null
}

/**
 * Die Antwort der Route gegen ihre feste Form prüfen. EIN Eintrag außerhalb
 * der Form verwirft die GANZE Liste: eine halbe Liste sähe aus wie eine
 * vollständige, und die Nummern stimmten nicht mehr.
 *
 * @returns {Array<{ host: string, health: boolean }> | null}
 */
export function parseWatchHosts(body) {
  const hosts = body?.hosts
  if (!Array.isArray(hosts) || hosts.length > MAX_HOSTS) return null
  const seen = new Set()
  const out = []
  for (const entry of hosts) {
    if (!entry || typeof entry !== 'object') return null
    const { host, health } = entry
    if (typeof host !== 'string' || !HOST_FORM.test(host) || typeof health !== 'boolean') return null
    if (seen.has(host)) return null
    seen.add(host)
    out.push({ host, health })
  }
  return out
}

/**
 * Die Liste lesen. Wirft NIE — jede Störung ist ein Wort aus `UNREAD_TEXT`.
 * Bei „nicht erreichbar" oder einem Fehler der Gegenseite genau EIN zweiter
 * Versuch nach kurzer Pause (ein Aussetzer ist kein Befund).
 *
 * @param {{ env?: Record<string, string | undefined>, fetchFn?: typeof fetch, retryDelayMs?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ state: 'read', hosts: Array<{ host: string, health: boolean }> } | { state: 'unread', reason: keyof typeof UNREAD_TEXT }>}
 */
export async function readCustomerHosts({ env = process.env, fetchFn = fetch, retryDelayMs = 5000, timeoutMs = 15_000 } = {}) {
  const secret = (env[SECRET_ENV] ?? '').trim()
  if (!secret) return { state: 'unread', reason: 'kein-geheimnis' }
  const url = watchHostsUrl(env)
  if (!url) return { state: 'unread', reason: 'adresse' }

  const attempt = async () => {
    let response
    try {
      response = await fetchFn(url, {
        redirect: 'error',
        headers: { [SECRET_HEADER]: secret, 'user-agent': 'pukalani-production-watch/1 (customer-hosts)' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    }
    catch {
      return { state: 'unread', reason: 'nicht-erreichbar', retry: true }
    }
    if (response.status === 401 || response.status === 403) return { state: 'unread', reason: 'abgelehnt' }
    if (response.status === 404) return { state: 'unread', reason: 'route-fehlt' }
    if (response.status !== 200) return { state: 'unread', reason: 'fehler', retry: response.status >= 500 }
    let body
    try {
      body = await response.json()
    }
    catch {
      return { state: 'unread', reason: 'form' }
    }
    const hosts = parseWatchHosts(body)
    return hosts ? { state: 'read', hosts } : { state: 'unread', reason: 'form' }
  }

  let result = await attempt()
  if (result.state === 'unread' && result.retry) {
    await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    result = await attempt()
  }
  return result.state === 'read' ? result : { state: 'unread', reason: result.reason }
}

/**
 * Welche Kundendomains prüft dieser Lauf? `nr`/`of` sind die Stelle in der
 * Liste der ROUTE (nach Name sortiert) — unabhängig davon, welche Einträge
 * die feste Liste schon kennt; so meint „3/5" bei jeder Abfrage dieselbe
 * Domain.
 *
 * @param {{ hosts: Array<{ host: string, health: boolean }>, fixedHosts: string[], mode: 'count' | 'alarm', drill?: boolean }} input
 */
export function planCustomerChecks({ hosts, fixedHosts, mode, drill = false }) {
  const fixed = new Set(fixedHosts)
  const all = hosts.map((entry, index) => ({ ...entry, nr: index + 1, of: hosts.length, inFixed: fixed.has(entry.host), drill: false }))
  const planned = mode === 'alarm' ? all.filter(entry => !entry.inFixed) : all
  // PROBEALARM: der erste Host der Liste gilt als kaputt, auch wenn ihn die
  // feste Liste schon kennt — sonst gäbe es heute nichts, woran sich die
  // Kette zeigen ließe.
  if (drill && all.length > 0) {
    const first = { ...all[0], drill: true }
    return [first, ...planned.filter(entry => entry.nr !== first.nr)]
  }
  return planned
}

/** Darf dieser Lauf Namen ausgeben? Nur von Hand, nie in einem CI-Lauf. */
export function namesAllowed({ argv = process.argv, env = process.env } = {}) {
  return argv.includes('--namen') && !env.GITHUB_ACTIONS && !env.CI
}

/** Wie eine Kundendomain in der Ausgabe heißt. */
export function customerLabel(entry, { names = false } = {}) {
  const label = `Kundendomain ${entry.nr}/${entry.of}`
  return names ? `${entry.host} (${label})` : label
}

/** Von einem Fehler nur das Kürzel (`ECONNRESET`) — der Wortlaut kann den Host nennen. */
export function safeErrorCode(error) {
  const code = error?.cause?.code ?? error?.code ?? error?.name
  return typeof code === 'string' && /^[A-Za-z_0-9]{3,40}$/.test(code) ? code : 'Fehler'
}

/** Die eine Zeile, die sagt, ob und was gelesen wurde. */
export function customerStatusLine(result, planned, mode) {
  if (result.state === 'unread') {
    return `Kundendomains: nicht gelesen — ${UNREAD_TEXT[result.reason]}. Geprüft wird die feste Liste.`
  }
  const total = result.hosts.length
  const where = mode === 'alarm'
    ? `${planned.length} davon stehen nicht in der festen Liste und werden hier geprüft`
    : `${planned.length} werden hier geprüft, Befunde nur gezählt`
  return `Kundendomains: ${total} aus dem Control Plane gelesen, ${where}.`
}

/** Die Nummern mit Befund als `3,5` — nur Ziffern und Kommas. */
export function numbersText(entries) {
  return [...new Set(entries.map(entry => entry.nr))].sort((a, b) => a - b).join(',')
}

/** Aus `3,5` wieder Nummern — alles andere als Ziffern und Kommas ergibt eine leere Liste. */
export function parseNumbers(text) {
  const raw = String(text ?? '').trim()
  if (!/^\d{1,4}(,\d{1,4})*$/.test(raw)) return []
  return raw.split(',').map(Number)
}
