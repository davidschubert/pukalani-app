import { CSP_REPORT_PATH } from './cspReport'

/**
 * SCHUTZ-KOPFZEILEN AUS EINER STELLE (SEC-006, seit 2026-11-16).
 *
 * Vorher sendete kein Host HSTS, `nosniff` kam nur dort, wo nginx es zufällig
 * setzte, und API-Antworten wie Dateien trugen gar nichts. Die Regeln stehen
 * hier pur (testbar ohne Nitro); gesetzt werden sie von
 * `server/plugins/security-headers.ts` — für JEDE Antwort, nicht nur für
 * SSR-Seiten.
 *
 * Bewusst NICHT hier: `frame-ancestors`. Diese eine Kopfzeile kennt
 * Embed-Erlaubnis und Verbots-Liste und entsteht weiter nur in
 * `server/utils/frameAncestors.ts`. Ebenso bewusst KEIN `X-Frame-Options`:
 * `frame-ancestors` deckt es, und XFO kann die Erlaubnisliste des
 * Embed-Produkts (`/embed` in fremden Seiten) gar nicht ausdrücken — ein
 * `SAMEORIGIN` daneben bräche jede Einbettung in Browsern, die XFO
 * auswerten.
 */

/**
 * EIN JAHR (Stufe 2, seit 2026-11-16). Stufe 1 war ein Tag: einige Stunden
 * lang live auf allen acht Hosts, jede Seite, jede API und das eingebettete
 * Produkt liefen normal — erst danach das Jahr (Davids Entscheidung: zwei
 * Stufen). KEIN `includeSubDomains` (Kundendomains und Unter-Adressen, die
 * nicht diese App bedient), KEIN `preload` — HSTS ist schwer zurückzunehmen:
 * ein Browser, der den Wert einmal gesehen hat, hält sich bis zum Ablauf
 * daran, auch wenn der Server ihn längst nicht mehr sendet. Zurück geht nur
 * langsam: einen kleinen Wert senden und warten, bis die alten Zusagen in den
 * Browsern abgelaufen sind. `null` schaltet HSTS ab.
 */
export const HSTS_MAX_AGE_SECONDS: number | null = 31536000

/**
 * Turnstile lädt sein Skript von hier (`TurnstileWidget.vue`, `SCRIPT_URL`).
 * Ein Test hält beide Stellen zusammen.
 */
export const TURNSTILE_SCRIPT_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Ist das ein Host, auf dem HSTS nichts verloren hat? Ein `localhost`, das
 * sich einen Tag lang HTTPS merkt, sperrt jeden anderen lokalen Dienst auf
 * demselben Namen aus — die Falle trifft Entwickler, nicht Angreifer.
 *
 * Leer oder fehlend gilt als lokal: h3 fällt ohne `Host` auf `localhost`
 * zurück, und genau so kommen die internen Abrufe (i18n-self-fetch,
 * Fehlerseiten-Durchgang) an. Eine öffentliche Antwort ohne Host gibt es
 * hinter nginx nicht.
 */
export function isLocalRequestHost(host: string | null | undefined): boolean {
  const raw = (host ?? '').trim().toLowerCase()
  if (!raw) return true
  // IPv6 in eckigen Klammern behält seine Doppelpunkte, der Port steht danach.
  const name = raw.startsWith('[')
    ? raw.slice(0, raw.indexOf(']') + 1)
    : raw.replace(/:\d*$/, '')
  if (name === 'localhost' || name === '127.0.0.1' || name === '[::1]') return true
  return name.endsWith('.localhost') || name.endsWith('.test')
}

/**
 * Die Kopfzeilen für ALLE Antworten (Seiten, API, Dateien, Fehler).
 *
 * `permissions-policy` sperrt nur, was kein Client-Code nutzt (Kamera,
 * Mikrofon, Standort — per Suche in packages/ und apps/ geprüft, 2026-11-16).
 * Braucht ein Produkt eine davon, gehört sie HIER heraus, nicht in eine
 * zweite Kopfzeile daneben.
 */
export function baseSecurityHeaders(
  host: string | null | undefined,
  hstsMaxAge: number | null = HSTS_MAX_AGE_SECONDS,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
  if (hstsMaxAge !== null && !isLocalRequestHost(host)) {
    headers['strict-transport-security'] = `max-age=${hstsMaxAge}`
  }
  return headers
}

/** Dieselbe Form wie der Filter in `frameAncestors.ts` — der Wert landet unescaped im Kopf. */
const SAFE_ORIGIN = /^https?:\/\/[\w.[\]-]+(:(\d+|\*))?$/

/**
 * `Content-Security-Policy-Report-Only` für SSR-Seiten — Stufe 1, nur
 * BEOBACHTEN.
 *
 * `'unsafe-inline'` steht drin, weil Nuxt seinen Payload und kleine
 * Start-Skripte inline ins HTML schreibt; ohne Nonce schlüge `'self'` allein
 * auf jeder Seite an, und das Signal ginge im Rauschen unter. Diese Stufe
 * fragt deshalb nur eines: lädt eine Seite Skripte von einer FREMDEN Quelle,
 * die wir nicht kennen?
 *
 * `report-uri` (SE1 a, seit 2026-11-17): der Browser schickt jeden Verstoß
 * an die eigene Annahme-Route (`CSP_REPORT_PATH`, relativ — also an den Host
 * der Seite). Bewusst NICHT der Eingang für Browser-Fehler: Erweiterungen
 * schieben Skripte in jede Seite und lösen Berichte aus, ohne dass die Seite
 * etwas falsch macht; die Route sortiert sie aus, zählt je Verstoß und
 * schreibt nichts über Personen (`shared/cspReport.ts`). `report-uri` und
 * nicht `report-to`: es braucht keine zweite Kopfzeile, und jeder Browser
 * versteht es.
 */
export function scriptCspReportOnly(extraScriptOrigins: string[]): string {
  const origins = [...new Set(extraScriptOrigins.filter(o => SAFE_ORIGIN.test(o)))]
  const scriptSrc = ["'self'", "'unsafe-inline'", ...origins].join(' ')
  return `script-src ${scriptSrc}; object-src 'none'; base-uri 'self'; report-uri ${CSP_REPORT_PATH}`
}
