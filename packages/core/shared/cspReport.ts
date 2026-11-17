/**
 * BERICHTE DER SKRIPT-REGEL (SE1 a, seit 2026-11-17) — die pure Hälfte.
 *
 * Die Skript-CSP beobachtet nur (`Content-Security-Policy-Report-Only`,
 * `shared/securityHeaders.ts`). Bis hierher stand ein Verstoß allein in der
 * Konsole des Browsers, der ihn sah. Jetzt schickt der Browser einen Bericht
 * an `CSP_REPORT_PATH`; diese Datei sagt, WAS davon angenommen und WAS davon
 * behalten wird. Die Route (`server/api/telemetry/csp-report.post.ts`) liest
 * nur, bremst und schreibt.
 *
 * DREI REGELN:
 *  1. NUR DIE ERWARTETE FORM. Zwei Rümpfe gibt es: den alten
 *     (`application/csp-report`, ein Objekt unter `csp-report`) und den der
 *     Reporting-API (`application/reports+json`, eine Liste). Alles andere
 *     ist kein Bericht.
 *  2. NICHTS ÜBER PERSONEN. Behalten werden vier kurze Wörter: welche
 *     Anweisung, welche fremde QUELLE (nur Schema und Host, nie ein Pfad),
 *     aus welcher Datei-Quelle, und der ERSTE Abschnitt des Seitenpfads
 *     (`/dashboard`, nie eine Id, nie eine Query — in einer Adresse kann ein
 *     Einmal-Code stehen). Keine Adresse des Aufrufers, kein Konto, kein
 *     Browser-Name, kein Skript-Auszug.
 *  3. BROWSER-ERWEITERUNGEN SIND KEIN VERSTOSS DER SEITE. Sie schieben eigene
 *     Skripte in jede Seite und lösen Berichte aus, ohne dass wir etwas
 *     falsch machen. Erkennbar sind sie am Schema der Quelle — solche
 *     Berichte fallen heraus, bevor irgendetwas geschrieben wird.
 */

/** Die Adresse, die die Kopfzeile nennt. Ein Test hält Route und Wert zusammen. */
export const CSP_REPORT_PATH = '/api/telemetry/csp-report'

/** Ein Bericht ist klein; alles darüber ist kein Bericht eines Browsers. */
export const CSP_REPORT_MAX_BYTES = 16 * 1024

/** Die Reporting-API bündelt; mehr als das liest die Route nicht aus. */
export const CSP_REPORT_MAX_ITEMS = 20

/**
 * Die Anweisungen UNSERER beobachtenden Regel (`scriptCspReportOnly`) samt
 * ihrer zwei Unterformen. Ein Bericht über etwas anderes stammt nicht von
 * dieser Regel.
 */
export const CSP_REPORT_DIRECTIVES = ['script-src', 'script-src-elem', 'script-src-attr', 'object-src', 'base-uri'] as const

/** Schemata, unter denen Browser ihre Erweiterungen und Innereien führen. */
const EXTENSION_SCHEMES = new Set([
  'chrome-extension',
  'moz-extension',
  'safari-extension',
  'safari-web-extension',
  'ms-browser-extension',
  'webkit-masked-url',
  'chrome',
  'resource',
  'about',
])

export interface CspViolation {
  /** Eine aus `CSP_REPORT_DIRECTIVES`. */
  directive: string
  /** `https://host[:port]`, ein Schema (`data`, `blob`) oder ein Wort des Browsers (`inline`, `eval`). */
  blocked: string
  /** Woher das auslösende Skript kam — dieselbe Form wie `blocked`, oder leer. */
  source: string
  /** Erster Abschnitt des Seitenpfads (`/`, `/dashboard`) oder leer. */
  area: string
}

export interface CspReportBatch {
  /** Berichte, die behalten werden. */
  violations: CspViolation[]
  /** Aussortiert: Browser-Erweiterung, fremde Seite, andere Regel. */
  ignored: number
}

const WORD = /^[a-z][a-z0-9+.-]{0,31}$/
const AREA = /^[a-z0-9][a-z0-9_-]{0,39}$/i

/**
 * Eine gemeldete Quelle auf das kürzen, was sie über die HERKUNFT sagt.
 * `https://cdn.example/pfad/datei.js?x=1` ⇒ `https://cdn.example`. Wörter des
 * Browsers (`inline`, `eval`, `data`) bleiben, alles Unlesbare wird leer.
 */
export function cspSourceLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim().toLowerCase()
  if (!raw || raw.length > 2048) return ''
  if (WORD.test(raw)) return raw
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return ''
  }
  const scheme = url.protocol.slice(0, -1)
  if (scheme === 'http' || scheme === 'https') return url.host ? `${scheme}://${url.host}` : ''
  return WORD.test(scheme) ? scheme : ''
}

function isExtensionSource(label: string): boolean {
  return EXTENSION_SCHEMES.has(label)
}

/** `/de/dashboard/x?y` ⇒ `/de`; die Startseite ⇒ `/`; Unlesbares ⇒ leer. */
function pageArea(pathname: string): string {
  const first = pathname.split('/').find(part => part.length > 0)
  if (first === undefined) return '/'
  return AREA.test(first) ? `/${first.toLowerCase()}` : ''
}

interface RawViolation {
  directive: unknown
  blocked: unknown
  source: unknown
  document: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function classify(raw: RawViolation, requestHost: string): CspViolation | 'ignored' | null {
  // `violated-directive` trägt in alten Browsern die ganze Anweisung samt
  // Quellenliste — das erste Wort ist ihr Name.
  const directive = text(raw.directive).trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const documentUri = text(raw.document)
  if (!directive || !documentUri) return null

  let document: URL
  try {
    document = new URL(documentUri)
  }
  catch {
    return null
  }
  // Ein Bericht über eine fremde Seite (gespeicherte Kopie, fremder Host)
  // sagt nichts über diese App.
  if (document.host.toLowerCase() !== requestHost.toLowerCase()) return 'ignored'
  if (!(CSP_REPORT_DIRECTIVES as readonly string[]).includes(directive)) return 'ignored'

  const blocked = cspSourceLabel(raw.blocked)
  const source = cspSourceLabel(raw.source)
  if (isExtensionSource(blocked) || isExtensionSource(source)) return 'ignored'
  // Ohne lesbare Quelle ist der Bericht nicht auswertbar — er zählt als
  // aussortiert, nicht als Verstoß.
  if (!blocked) return 'ignored'

  return { directive, blocked, source, area: pageArea(document.pathname) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Liest einen Rumpf in einer der zwei erwarteten Formen. `null` heißt: das
 * ist kein Bericht (falscher Typ, falsche Form) — die Route antwortet 400.
 *
 * `requestHost` ist der Host der Anfrage: ein Bericht gilt nur für Seiten
 * DIESES Hosts.
 */
export function readCspReports(contentType: string | undefined | null, body: unknown, requestHost: string): CspReportBatch | null {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  const raws: RawViolation[] = []

  if (type === 'application/csp-report') {
    if (!isRecord(body) || !isRecord(body['csp-report'])) return null
    const report = body['csp-report']
    raws.push({
      directive: report['effective-directive'] ?? report['violated-directive'],
      blocked: report['blocked-uri'],
      source: report['source-file'],
      document: report['document-uri'],
    })
  }
  else if (type === 'application/reports+json') {
    if (!Array.isArray(body) || body.length === 0 || body.length > CSP_REPORT_MAX_ITEMS) return null
    for (const item of body) {
      if (!isRecord(item)) return null
      // Die Reporting-API liefert auch andere Sorten (Absturz, Veraltetes).
      if (item.type !== 'csp-violation') continue
      if (!isRecord(item.body)) return null
      raws.push({
        directive: item.body.effectiveDirective,
        blocked: item.body.blockedURL,
        source: item.body.sourceFile,
        document: item.body.documentURL,
      })
    }
  }
  else {
    return null
  }

  const batch: CspReportBatch = { violations: [], ignored: 0 }
  for (const raw of raws) {
    const result = classify(raw, requestHost)
    if (result === null) return null
    if (result === 'ignored') batch.ignored++
    else batch.violations.push(result)
  }
  return batch
}

/** Derselbe Verstoß = dieselben vier Wörter. */
export function cspViolationKey(violation: CspViolation): string {
  return [violation.directive, violation.blocked, violation.source, violation.area].join(' ')
}
