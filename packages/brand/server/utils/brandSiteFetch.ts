import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage, RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import {
  BRAND_SITE_ANALYSIS_MAX_BYTES,
  BRAND_SITE_ANALYSIS_TIMEOUT_MS,
  type BrandSiteAnalysisErrorCode,
  type BrandSiteContent,
  type BrandSiteSignals,
  allIpsAllowed,
  analyzableUrl,
  contentTypeIsHtml,
  exceedsByteBudget,
  extractSiteContent,
  extractSiteSignals,
  ipIsForbidden,
  isRedirectStatus,
  redirectBudgetLeft,
  redirectTarget,
} from '../../shared/brandSiteAnalysis'

/**
 * DER EINE AUSGEHENDE ABRUF DES BRAND-WIZARDS — und die Umsetzung des
 * SSRF-Vertrags aus `shared/brandSiteAnalysis.ts`.
 *
 * ── WARUM NICHT `fetch` ───────────────────────────────────────────────────
 * `fetch` (undici) kann nicht sagen, ZU WELCHER Adresse es verbunden hat, und
 * es folgt Weiterleitungen selbst — beides ist genau das, was hier nicht
 * passieren darf. Ein `dispatcher` mit eigenem Connector könnte es, kostete
 * aber `undici` als DIREKTE Abhängigkeit; im Baum liegen heute VIER Fassungen
 * davon als transitive Kopien (6.27, 6.28, 8.9, 8.10), und `check:single-copy`
 * ist genau deshalb ein Gate. `node:http`/`node:https` bringen mit, was
 * gebraucht wird, und kosten nichts.
 *
 * ── DAS REBINDING-FENSTER WIRD GESCHLOSSEN, NICHT VERKLEINERT ─────────────
 * Zwischen „Name aufgelöst und geprüft" und „Verbindung steht" liegt bei jedem
 * naiven Ansatz eine Lücke: der Auflöser wird ein ZWEITES Mal gefragt (vom
 * Betriebssystem, beim Verbinden), und ein Angreifer, der seinen DNS-Eintrag
 * mit TTL 0 wechseln lässt, antwortet beim zweiten Mal mit 127.0.0.1. Deshalb
 * wird hier EINMAL aufgelöst, jede Antwort geprüft — und dem Request eine
 * eigene `lookup`-Funktion mitgegeben, die AUSSCHLIESSLICH diese geprüften
 * Adressen zurückgibt. Es gibt keine zweite Auflösung, also auch kein Fenster.
 * Die tatsächlich verbundene Adresse wird trotzdem noch einmal geprüft (Gürtel
 * UND Hosenträger — die Kosten sind ein Vergleich).
 *
 * ── ROHES HTML VERLÄSST `fetchBrandSite` NIE ──────────────────────────────
 * Der Plan (§9b) verlangt, das Rohmaterial nach der Extraktion früh zu
 * verwerfen. Deshalb gibt DIESE Funktion `BrandSiteContent` zurück und nicht
 * den Quelltext: es gibt gar keinen Aufrufer, der ihn speichern KÖNNTE.
 *
 * ── WAS SEIT MV1 M2 DANEBEN STEHT: `fetchBrandDocument` ───────────────────
 * Der Marktvergleich (docs/archiv/BRAND-MARKTVERGLEICH.md §7.4) liest MEHRERE
 * Seiten je Marke und dazu `robots.txt`, `sitemap.xml` und `llms.txt`. Beides
 * kann `fetchBrandSite` nicht: es klemmt den Content-Type hart auf HTML und
 * gibt den Quelltext nicht heraus — aus ihm kommen aber die internen Links,
 * das JSON-LD und die `<meta name="robots">`-Anweisungen, die über die
 * Erlaubnis entscheiden.
 *
 * Die Antwort darauf ist NICHT ein zweiter Abruf mit einem zweiten
 * SSRF-Schutz (§7.4: „EINMAL gebaut, beiden Produkten zugänglich"), sondern
 * eine generische Ebene UNTER `fetchBrandSite`: `fetchBrandDocument` fährt
 * dieselbe Sprung-Kette und dieselben Prüfungen und gibt Rumpf und Kopfzeilen
 * heraus. `fetchBrandSite` ist seither eine Hülle darum — Signatur,
 * Fehlercodes und Rückgabe unverändert, damit der Brand-Check nichts merkt.
 *
 * Das Rohmaterial bleibt trotzdem im brand-Layer: der einzige Aufrufer von
 * `fetchBrandDocument` ist `brandSiteCrawl.ts` nebenan, und was der
 * market-Layer über seinen Vertrag bekommt, sind bereits ausgewertete Seiten
 * (Titel, Text, Links, JSON-LD) — nie HTML.
 */

export class BrandSiteFetchError extends Error {
  // Ein GEWÖHNLICHES Feld statt einer Parameter-Eigenschaft (`readonly code`
  // im Konstruktor): die ist reine TypeScript-Syntax mit Laufzeit-Wirkung, und
  // Nodes „strip-only"-Modus (jedes `--experimental-strip-types`-Skript im
  // Repo) bricht daran. Der Gewinn wäre eine gesparte Zeile.
  readonly code: BrandSiteAnalysisErrorCode

  constructor(code: BrandSiteAnalysisErrorCode, message: string) {
    super(message)
    this.name = 'BrandSiteFetchError'
    this.code = code
  }
}

export interface BrandSiteFetchResult {
  content: BrandSiteContent
  /**
   * DIE MESSBAREN SIGNALE derselben Seite (Brand-Check §3) — aus DEMSELBEN
   * HTML gewonnen wie `content`, weil das rohe HTML diese Datei nicht verlässt
   * (s. Kopf). Ein zweiter Abruf, nur um Kopfdaten zu lesen, wäre eine zweite
   * Last auf einem fremden Server für Material, das wir schon in der Hand
   * hatten. Der Wizard ignoriert das Feld.
   */
  signals: BrandSiteSignals
  /** Die Adresse, bei der wir nach allen Sprüngen gelandet sind. */
  finalUrl: string
  /** Nur fürs Log — der HOST, nie der Pfad. */
  finalHost: string
  /**
   * Sind wir von `http:` auf `https:` GESPRUNGEN? Das ist der einzige Beweis
   * für die Weiterleitung, den ein Aussen-Check mit EINEM Abruf führen kann
   * (Kriterium h3) — ohne eigene Anfrage an die http-Adresse, die der Plan in
   * Runde 1 ausschliesst (§6, „Mehrseiten-Crawl" gehört nicht dazu).
   */
  httpsUpgraded: boolean
}

/** Ein Hostname ohne die Klammern, die `URL.hostname` einer v6-Adresse lässt. */
function bareHost(url: URL): string {
  return url.hostname.replace(/^\[/, '').replace(/\]$/, '')
}

// ── Die Entwicklungs-Ausnahme für Beweise gegen einen eigenen Server ───────

/**
 * DIE EINZIGE AUSNAHME VOM SSRF-VERTRAG — und sie ist auf dem Server tot.
 *
 * ── WARUM ES SIE GIBT ─────────────────────────────────────────────────────
 * Ein Beweis-Skript, das den Abruf END-TO-END misst, braucht Seiten, die es
 * selbst ausliefert (`packages/market/scripts/verify-market-fetch.mjs` fährt
 * dafür `node:http`-Server über den erfundenen Demo-Sites). Die liegen
 * zwangsläufig auf `127.0.0.1` und auf einem freien Port — und genau das
 * verbietet der Vertrag zu Recht: Loopback ist verboten
 * (`ipIsForbidden`), und ein Port ausser 80/443 ist es auch
 * (`analyzableUrl`). Ohne diese Ausnahme gäbe es für den teuersten Teil des
 * Marktvergleichs keinen Beweis gegen eine echte Route — nur Unit-Tests mit
 * eingesetztem Abruf, und die messen den Abruf gerade nicht.
 *
 * ── WARUM SIE UNGEFÄHRLICH IST ────────────────────────────────────────────
 * ZWEI Bedingungen, beide nötig: `NODE_ENV !== 'production'` UND die
 * ausdrücklich gesetzte Variable. Auf einem Server ist die erste falsch, und
 * `pnpm ops:site-env` kennt die Variable nicht — sie ist kein
 * Pflicht-Schlüssel, sondern ein Handgriff am Beweis (dasselbe Muster wie
 * `BRAND_DEV_STUB_REVIEW`). Und sie öffnet NUR Loopback: die Metadaten-Adresse
 * der Cloud, das Firmennetz und jeder andere private Bereich bleiben auch mit
 * gesetzter Variable verboten. Wer sie auf seinem Rechner setzt, kann seinen
 * eigenen Rechner lesen — das kann er ohnehin.
 */
function devLoopbackAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.BRAND_SITE_FETCH_ALLOW_LOOPBACK === '1'
}

/** `127.0.0.0/8`, `::1` und die eingebettete v4-Form davon — sonst nichts. */
function isLoopbackIp(ip: string): boolean {
  const value = ip.trim().toLowerCase()
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  const embedded = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)?.[1] ?? value
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(embedded)
  if (!octets) return false
  return octets.slice(1).every(part => Number(part) <= 255) && Number(octets[1]) === 127
}

/** Ein Hostname, der ohne Auflösung erkennbar auf den eigenen Rechner zeigt. */
function isLoopbackHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  return value === 'localhost' || value.endsWith('.localhost') || isLoopbackIp(value)
}

/**
 * Die Adress-Prüfung MIT der Ausnahme. Sie ersetzt `ipIsForbidden` an jeder
 * Stelle dieser Datei — eine einzige vergessene Stelle wäre entweder ein Loch
 * im Vertrag oder ein Beweis, der auf halbem Weg abbricht.
 */
function addressForbidden(ip: string): boolean {
  if (!ipIsForbidden(ip)) return false
  return !(devLoopbackAllowed() && isLoopbackIp(ip))
}

/**
 * Die Adress-Prüfung der EINGABE mit derselben Ausnahme: im Dev-Modus darf ein
 * LOOPBACK-Host auch einen freien Port tragen. Für jeden anderen Host bleibt
 * `analyzableUrl` das letzte Wort — die Port-Regel ist keine Kosmetik, sie
 * hält den Abruf von den zehntausend Diensten fern, die intern auf hohen Ports
 * lauschen.
 */
function fetchableUrl(raw: string): URL | null {
  const allowed = analyzableUrl(raw)
  if (allowed) return allowed
  if (!devLoopbackAllowed()) return null

  let url: URL
  try {
    url = new URL(raw.trim())
  }
  catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!url.hostname || !isLoopbackHost(bareHost(url))) return null
  return url
}

/** Ein Sprung im Dev-Loopback-Modus — relativ aufgelöst, dann dieselbe Tür. */
function devRedirectTarget(location: string | undefined, base: URL): URL | null {
  const value = location?.trim()
  if (!value) return null
  try {
    return fetchableUrl(new URL(value, base).toString())
  }
  catch {
    return null
  }
}

interface CheckedAddress { address: string, family: number }

/**
 * EINMAL AUFLÖSEN, ALLES PRÜFEN. Eine einzige verbotene Adresse lässt den
 * ganzen Namen durchfallen: ein Name mit zwei A-Records (einer öffentlich,
 * einer intern) wäre sonst ein Würfel, und jeder zweite Versuch gewönne.
 */
async function resolveChecked(host: string): Promise<CheckedAddress[]> {
  let addresses: CheckedAddress[]
  try {
    addresses = (await dnsLookup(host, { all: true })).map(entry => ({
      address: entry.address,
      family: entry.family,
    }))
  }
  catch {
    throw new BrandSiteFetchError('fetch_failed', 'DNS lookup failed')
  }
  // `allIpsAllowed` bleibt der Vertrag; im Dev-Modus mit ausdrücklicher
  // Loopback-Erlaubnis entscheidet `addressForbidden` (s. dort) — eine einzige
  // verbotene Adresse lässt den Namen weiterhin ganz durchfallen.
  const allowed = devLoopbackAllowed()
    ? addresses.every(entry => !addressForbidden(entry.address)) && addresses.length > 0
    : allIpsAllowed(addresses.map(entry => entry.address))
  if (!allowed) {
    throw new BrandSiteFetchError('blocked_target', 'Resolved address is not allowed')
  }
  return addresses
}

/**
 * Die `lookup`-Option des Requests: sie beantwortet die Frage des Sockets mit
 * den BEREITS GEPRÜFTEN Adressen und fragt niemanden. Geprüft wird trotzdem
 * noch einmal — diese Funktion ist die einzige Stelle, an der eine Adresse in
 * den Socket geht, und sie soll auch dann richtig sein, wenn jemand sie später
 * mit einer anderen Liste aufruft.
 */
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | CheckedAddress[],
  family?: number,
) => void

function pinnedLookup(addresses: readonly CheckedAddress[]) {
  return (_host: string, options: unknown, callback: LookupCallback): void => {
    const safe = addresses.filter(entry => !addressForbidden(entry.address))
    if (!safe.length) {
      callback(Object.assign(new Error('Blocked target'), { code: 'EACCES' }))
      return
    }
    const wantsAll = typeof options === 'object' && options !== null
      && (options as { all?: boolean }).all === true
    if (wantsAll) callback(null, [...safe])
    else callback(null, safe[0]!.address, safe[0]!.family)
  }
}

/** utf-8, ausser die Seite sagt ausdrücklich etwas anderes Bekanntes. */
function bufferEncoding(contentType: string | undefined): BufferEncoding {
  const charset = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? '')?.[1]?.toLowerCase()
  if (charset === 'iso-8859-1' || charset === 'latin1' || charset === 'windows-1252') return 'latin1'
  return 'utf8'
}

/**
 * Der entpackende Strom — MIT eigenem Zähler. Ein Deckel, der nur die Bytes
 * vom Draht zählt, sieht eine Zip-Bombe nicht: 4 KB gzip können sich zu
 * Gigabytes entfalten, und der Speicher ist dann weg, bevor irgendein Limit
 * greift.
 */
function decodedStream(res: IncomingMessage): Readable {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim()
  if (!encoding || encoding === 'identity') return res
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(createGunzip())
  if (encoding === 'deflate') return res.pipe(createInflate())
  if (encoding === 'br') return res.pipe(createBrotliDecompress())
  throw new BrandSiteFetchError('fetch_failed', 'Unsupported content encoding')
}

type HopResult
  = { kind: 'body', html: string, headers: Readonly<Record<string, string>> }
    | { kind: 'redirect', location: string | undefined }

/**
 * WAS EIN SPRUNG AKZEPTIERT — die drei Dinge, die zwischen „eine Website
 * lesen" und „eine robots.txt lesen" verschieden sind. Alles andere (Prüfkette,
 * Sprung-Budget, Zip-Bomben-Deckel, Zeitgrenze) ist identisch und steht
 * deshalb nur einmal da.
 */
interface HopPolicy {
  accept: string
  acceptsContentType: (value: string | undefined) => boolean
  maxBytes: number
  userAgent: string
}

/**
 * EIN Sprung: verbinden, Kopf prüfen, Rumpf lesen — mit hartem Byte-Deckel.
 * Wirft `BrandSiteFetchError`; alles andere wäre für den Aufrufer ein Rätsel.
 */
async function fetchHop(
  url: URL,
  addresses: readonly CheckedAddress[],
  deadline: number,
  policy: HopPolicy,
): Promise<HopResult> {
  const host = bareHost(url)
  const secure = url.protocol === 'https:'
  const remaining = Math.max(1, deadline - Date.now())

  const options: RequestOptions = {
    method: 'GET',
    hostname: host,
    port: url.port || (secure ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    // Ohne eigenen Agent landet dieser Request im globalen Pool — und damit in
    // einer wiederverwendeten Verbindung, deren Ziel nicht mehr unsere geprüfte
    // Adresse sein muss.
    agent: false,
    lookup: pinnedLookup(addresses) as RequestOptions['lookup'],
    headers: {
      'host': url.host,
      // Ein ehrlicher Absender: wer im Log seines Servers sieht, wer da liest,
      // soll es zuordnen können. Kein Browser-Kostüm.
      'user-agent': policy.userAgent,
      'accept': policy.accept,
      // Wir BITTEN um Unkomprimiertes; wer trotzdem packt, wird entpackt (s.
      // `decodedStream`) — die Bitte allein ist keine Sicherung.
      'accept-encoding': 'identity',
      'accept-language': 'en;q=0.9,de;q=0.8',
    },
    timeout: remaining,
    ...(secure ? { servername: host } : {}),
  }

  return await new Promise<HopResult>((resolve, reject) => {
    const send = secure ? httpsRequest : httpRequest
    const req = send(options, (res) => {
      // DIE VERBUNDENE ADRESSE, nicht die aufgelöste (s. Kopf).
      const remote = res.socket?.remoteAddress ?? ''
      if (addressForbidden(remote)) {
        res.destroy()
        req.destroy()
        reject(new BrandSiteFetchError('blocked_target', 'Connected address is not allowed'))
        return
      }

      const status = res.statusCode ?? 0
      if (isRedirectStatus(status)) {
        const location = res.headers.location
        res.resume()
        req.destroy()
        resolve({ kind: 'redirect', location })
        return
      }
      if (status < 200 || status >= 300) {
        res.resume()
        req.destroy()
        reject(new BrandSiteFetchError('fetch_failed', `Unexpected status ${status}`))
        return
      }

      const contentType = res.headers['content-type']
      if (!policy.acceptsContentType(contentType)) {
        res.destroy()
        req.destroy()
        reject(new BrandSiteFetchError('not_html', 'Response has an unexpected content type'))
        return
      }
      // `Content-Length` ist ein VERSPRECHEN, kein Beweis — es erspart im
      // Gutfall nur das Lesen. Der wirksame Deckel steht unten am Strom.
      const promised = Number(res.headers['content-length'] ?? '0')
      if (Number.isFinite(promised) && exceedsByteBudget(promised, policy.maxBytes)) {
        res.destroy()
        req.destroy()
        reject(new BrandSiteFetchError('too_large', 'Content-Length exceeds budget'))
        return
      }

      let stream: Readable
      try {
        stream = decodedStream(res)
      }
      catch (error) {
        res.destroy()
        req.destroy()
        reject(error)
        return
      }

      const encoding = bufferEncoding(contentType)
      const chunks: Buffer[] = []
      let raw = 0
      let decoded = 0
      let settled = false

      const stop = (error: BrandSiteFetchError): void => {
        if (settled) return
        settled = true
        res.destroy()
        stream.destroy()
        req.destroy()
        reject(error)
      }

      res.on('data', (chunk: Buffer) => {
        raw += chunk.length
        if (exceedsByteBudget(raw, policy.maxBytes)) stop(new BrandSiteFetchError('too_large', 'Response body exceeds budget'))
      })
      stream.on('data', (chunk: Buffer) => {
        decoded += chunk.length
        if (exceedsByteBudget(decoded, policy.maxBytes)) {
          stop(new BrandSiteFetchError('too_large', 'Decompressed body exceeds budget'))
          return
        }
        chunks.push(chunk)
      })
      stream.on('error', () => stop(new BrandSiteFetchError('fetch_failed', 'Response stream failed')))
      stream.on('end', () => {
        if (settled) return
        settled = true
        resolve({
          kind: 'body',
          html: Buffer.concat(chunks).toString(encoding),
          // NUR die Kopfzeilen, nicht der ganze `IncomingMessage`: der trägt
          // den Socket mit sich, und ein Aufrufer, der ihn festhält, hält eine
          // Verbindung fest. Mehrfach-Werte werden zusammengezogen — der eine
          // Leser (`TDM-Reservation`) fragt nach EINEM Wert.
          headers: Object.fromEntries(
            Object.entries(res.headers).map(([key, value]) => [
              key.toLowerCase(),
              Array.isArray(value) ? value.join(', ') : String(value ?? ''),
            ]),
          ),
        })
      })
    })

    // Die Adresse, die der Socket wirklich benutzt — sie kommt aus unserer
    // eigenen `lookup`, wird hier aber nicht geglaubt, sondern geprüft.
    req.on('socket', (socket) => {
      socket.on('lookup', (_error, address: string) => {
        if (address && addressForbidden(address)) {
          socket.destroy(new Error('Blocked target'))
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new BrandSiteFetchError('fetch_failed', 'Request timed out'))
    })
    req.on('error', (error) => {
      reject(error instanceof BrandSiteFetchError
        ? error
        : new BrandSiteFetchError('fetch_failed', 'Request failed'))
    })
    req.end()
  })
}

/**
 * DER STANDARD-ABSENDER DES WIZARDS. Ein ehrlicher Absender: wer im Log seines
 * Servers sieht, wer da liest, soll es zuordnen können. Kein Browser-Kostüm.
 */
export const BRAND_SITE_USER_AGENT = 'PukalaniBrandWizard/1.0 (+https://pukalani.app)'

/**
 * DER ABSENDER DES BRAND-CHECKS (BS1 R2b, Davids Entscheidung 2026-09-08) —
 * ein EIGENER neben dem des Wizards, aus demselben Grund wie
 * `BRAND_MARKET_USER_AGENT`: ein Betreiber muss den Vorgang benennen können,
 * den er erlauben oder verbieten will. „Ich trage meine eigene Startseite in
 * einen Wizard ein" ist etwas anderes als „ein Fremder lässt meine Startseite
 * bewerten" — zwei Vorgänge, zwei Namen, zwei Entscheidungen.
 *
 * Die `+`-Adresse zeigt auf die METHODIK-SEITE, weil dort schon steht, was
 * gelesen wird, was davon bleibt und wie man uns aussperrt. Eine
 * Absender-Adresse, die auf eine Seite ohne diese Auskunft zeigt, ist eine
 * Höflichkeitsfloskel; genagelt in `tests/brandCheckMethod.test.ts`.
 */
export const BRAND_CHECK_USER_AGENT = 'PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)'

/** Das Token, das eine `robots.txt`-Gruppe für den Brand-Check adressiert (klein). */
export const BRAND_CHECK_BOT_TOKEN = 'pukalanibrandcheck'

/** Was ein Aufrufer am generischen Abruf einstellen darf (s. `HopPolicy`). */
export interface BrandDocumentFetchOptions {
  /** Der `Accept`-Kopf. Default: HTML. */
  accept?: string
  /** Welchen Content-Type wir annehmen. Default: `contentTypeIsHtml`. */
  acceptsContentType?: (value: string | undefined) => boolean
  /** Byte-Deckel für Draht UND entpackten Strom. Default: 2 MB. */
  maxBytes?: number
  /** Zeitgrenze über ALLE Sprünge. Default: 10 s. */
  timeoutMs?: number
  /** Wer wir sind. Default: `BRAND_SITE_USER_AGENT`. */
  userAgent?: string
}

export interface BrandDocumentFetchResult {
  /** Der Rumpf als Text — HTML, XML oder Klartext, je nach Aufrufer. */
  body: string
  /** Die Kopfzeilen der letzten Antwort, kleingeschrieben. */
  headers: Readonly<Record<string, string>>
  /** Die Adresse, bei der wir nach allen Sprüngen gelandet sind. */
  finalUrl: string
  /** Nur fürs Log — der HOST, nie der Pfad. */
  finalHost: string
  httpsUpgraded: boolean
}

/**
 * DIE EINGEREICHTE ADRESSE LESEN — und höchstens drei Sprünge weit folgen.
 *
 * JEDER Sprung durchläuft dieselbe Kette von vorn: Adresse prüfen (Schema,
 * Port) → auflösen → alle Adressen prüfen → verbinden → verbundene Adresse
 * prüfen. Ein `Location:`-Kopf ist damit kein Sonderfall, sondern eine neue
 * Eingabe — genau das ist der Punkt, an dem Prüfungen sonst durchrutschen.
 *
 * Das ist die GENERISCHE Fassung (MV1 M2, s. Kopf): sie gibt den Rumpf heraus
 * und lässt den Content-Type offen. `fetchBrandSite` darunter ist die
 * unveränderte Fassung des Wizards und des Brand-Checks.
 */
export async function fetchBrandDocument(
  raw: string,
  options: BrandDocumentFetchOptions = {},
): Promise<BrandDocumentFetchResult> {
  const initial = fetchableUrl(raw)
  if (!initial) throw new BrandSiteFetchError('blocked_target', 'URL is not analyzable')
  // AUSDRÜCKLICH `URL` UND NICHT `URL | null`: die Zuweisung am Schleifenende
  // (`target = next`) hängt sonst an der Verengung durch das `throw` — und
  // `next` hängt seinerseits an `target`. TypeScript sieht darin einen Zirkel
  // (TS7022) und macht `next` zu `any`, womit die Prüfungen still ausfallen.
  let target: URL = initial

  const policy: HopPolicy = {
    accept: options.accept ?? 'text/html,application/xhtml+xml',
    acceptsContentType: options.acceptsContentType ?? contentTypeIsHtml,
    maxBytes: options.maxBytes ?? BRAND_SITE_ANALYSIS_MAX_BYTES,
    userAgent: options.userAgent ?? BRAND_SITE_USER_AGENT,
  }
  const deadline = Date.now() + (options.timeoutMs ?? BRAND_SITE_ANALYSIS_TIMEOUT_MS)
  const startedInsecure = target.protocol === 'http:'

  for (let hop = 0; ; hop++) {
    if (Date.now() >= deadline) throw new BrandSiteFetchError('fetch_failed', 'Timed out')

    const addresses = await resolveChecked(bareHost(target))
    const result = await fetchHop(target, addresses, deadline, policy)

    if (result.kind === 'body') {
      return {
        body: result.html,
        headers: result.headers,
        finalUrl: target.toString(),
        finalHost: target.host,
        httpsUpgraded: startedInsecure && target.protocol === 'https:',
      }
    }

    if (!redirectBudgetLeft(hop)) {
      throw new BrandSiteFetchError('fetch_failed', 'Too many redirects')
    }
    // Im Dev-Loopback-Modus geht der Sprung durch dieselbe gelockerte Tür wie
    // die erste Adresse — sonst stürbe ein Beweis an der eigenen Ausnahme.
    const next: URL | null = redirectTarget(result.location, target)
      ?? (devLoopbackAllowed() ? devRedirectTarget(result.location, target) : null)
    if (!next) throw new BrandSiteFetchError('blocked_target', 'Redirect target is not allowed')
    target = next
  }
}

/**
 * DIE EINE SEITE DES WIZARDS UND DES BRAND-CHECKS — unverändert in Signatur,
 * Fehlercodes und Rückgabe.
 *
 * UMFANG PHASE 1: EINE Seite. Gefundene Unterseiten werden weder gelesen noch
 * angeboten (Plan §9b, „zuerst NUR die eingereichte URL"). Der Marktvergleich
 * liest mehrere — über `brandSiteCrawl.ts`, nicht über diese Funktion.
 *
 * Das rohe HTML verlässt sie weiterhin nicht: es wird hier ausgewertet und
 * fällt mit dem Ende des Aufrufs weg.
 */
export async function fetchBrandSite(raw: string): Promise<BrandSiteFetchResult> {
  const document = await fetchBrandDocument(raw)
  return {
    content: extractSiteContent(document.body),
    signals: extractSiteSignals(document.body),
    finalUrl: document.finalUrl,
    finalHost: document.finalHost,
    httpsUpgraded: document.httpsUpgraded,
  }
}
