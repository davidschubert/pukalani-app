/**
 * Unbekannter Host (C12b) — PURE Regeln für die EINE Stelle, an der ein
 * Besucher eine Adresse aufruft, die zu keiner Community gehört
 * (z. B. `tippfehler.pukalani.app` auf der Wildcard).
 *
 * WARUM DAS HIER LIEGT: an dem Fall hängen ZWEI Seiten, die sich einig sein
 * müssen — `server/middleware/00.tenant.ts` (wirft den 404 und markiert ihn)
 * und `CoreErrorPage` (macht daraus einen Satz, den ein Besucher versteht).
 * Zwei Kopien der Erkennung wären ein sicherer Weg zurück in den Zustand, in
 * dem die Seite etwas anderes behauptet als der Server antwortet.
 *
 * WAS VORHER SCHIEFLIEF (nachgemessen 2026-07-30, behoben 2026-07-31): der
 * 404 fiel in der SERVER-Middleware, also vor dem Renderer. Nuxts
 * Fehler-Handler rendert die Fehlerseite über einen INTERNEN Request auf
 * `/__nuxt_error` (localFetch, `@nuxt/nitro-server` handlers/error.mjs) — und
 * der lief durch dieselbe Middleware, mit demselben unbekannten Host, und warf
 * wieder. Für diesen zweiten Durchgang schaltet Nuxt seinen Renderer bewusst ab
 * (`event.path.startsWith('/__nuxt_error') ? null : localFetch(...)`, sonst
 * gäbe es eine Endlosschleife) und fällt auf sein EINGEBAUTES Template zurück.
 * Dieses Template liest `status`/`statusText`; Nitros Fehler-Body trägt aber
 * `statusCode`/`statusMessage` (nitropack internal/error/prod.mjs) — `status`
 * fehlt also und das Template nimmt seinen eigenen Default: **500**. Der
 * `statusText` kam durch (`errorObject.statusText ||= error.statusMessage`).
 * Ergebnis: eine Seite mit dem Titel „500 - Unknown host" über einer Antwort,
 * die korrekt 404 war — falsche Zahl UND Betreiber-Jargon vor dem Besucher.
 */

/**
 * Der Grund im Statustext. Bleibt bewusst englisch und technisch: er steht in
 * der HTTP-Statuszeile (Logs, Monitoring), nicht auf der Seite.
 */
export const UNKNOWN_HOST_STATUS_TEXT = 'Unknown host'

/** Fachlicher Grund für `error.data.code` (Envelope-Muster, core/server/error.ts). */
export const UNKNOWN_HOST_CODE = 'unknown_host'

/**
 * Ist das der interne Render-Durchgang für Nuxts Fehlerseite?
 *
 * NUR dieser eine Pfad — und er ist keine Hintertür: Nuxts Renderer beantwortet
 * `/__nuxt_error` ausschließlich für INTERNE Requests (`__unenv__` am
 * Node-Request, handlers/renderer.mjs) und wirft für alles von außen selbst
 * 404. Wer die Mandanten-Auflösung hier überspringt, öffnet also keinen
 * ungescopten Zugang — er lässt nur die Fehlerseite rendern, die sonst gar
 * nicht entstehen kann.
 */
export function isErrorPageRenderPass(path: string | undefined | null): boolean {
  return (path || '').startsWith('/__nuxt_error')
}

/** Fehler-Form, wie sie Server (H3Error) und Client (NuxtError) gemeinsam haben. */
export interface UnknownHostErrorLike {
  status?: number | string | null
  statusCode?: number | string | null
  statusText?: string | null
  statusMessage?: string | null
  data?: unknown
}

function statusOf(error: UnknownHostErrorLike): number {
  const raw = error.statusCode ?? error.status
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function codeOf(data: unknown): string | null {
  if (typeof data === 'string') {
    try {
      return codeOf(JSON.parse(data))
    }
    catch {
      return null
    }
  }
  if (data && typeof data === 'object' && 'code' in data) {
    const code = (data as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

/**
 * Gehört dieser Fehler zu einem unbekannten Host?
 *
 * Zwei Merkmale, weil der Fehler auf dem Weg zum Browser durch eine
 * Query-Serialisierung läuft: `data.code` überlebt sie nicht zuverlässig
 * (`withQuery` + optionales `destr`), der `statusMessage` schon. Beide zeigen
 * auf dieselbe eine Wurfstelle — 404 ist Pflicht, damit ein 500 aus einem
 * kaputten Resolver NIE als „gibt es hier nicht" beschönigt wird (der Resolver
 * wirft bewusst fail-loud).
 */
export function isUnknownHostError(error: UnknownHostErrorLike | null | undefined): boolean {
  if (!error) return false
  if (statusOf(error) !== 404) return false
  if (codeOf(error.data) === UNKNOWN_HOST_CODE) return true
  return error.statusMessage === UNKNOWN_HOST_STATUS_TEXT || error.statusText === UNKNOWN_HOST_STATUS_TEXT
}

/**
 * ── TRENNUNG AN, ABER NIEMAND, DER SIE PRÜFEN KANN (SEC-025, 2026-11-13) ──
 *
 * Die zweite Antwort derselben Middleware, an der wieder zwei Seiten hängen:
 * `00.tenant.ts` wirft sie, `CoreErrorPage` und `startWhenHostResolves()`
 * erkennen sie. Fall: `pukalani.tenancy.enabled` ist an, aber die App hat
 * keinen Resolver registriert (Platform-App ohne `NUXT_PLATFORM_CONTROL_*`).
 * Davids Entscheidung: „Eine Sicherung, die nicht prüfen kann, lehnt ab" —
 * 503 für jeden Host und jeden Pfad statt eines Betriebs ohne Trennung.
 *
 * Der Statustext bleibt (wie beim unbekannten Host) englisch und nennt KEINE
 * Variable: er steht in der Statuszeile, und welche Einstellung fehlt, sagt
 * nur das Server-Log.
 */
export const TENANT_RESOLVER_MISSING_STATUS_TEXT = 'Tenant resolution unavailable'

/** Fachlicher Grund für `error.data.code` und für `reason` in `/api/health`. */
export const TENANT_RESOLVER_MISSING_CODE = 'tenant_resolver_missing'

/**
 * Ist das die 503 „Trennung kann nicht geprüft werden"? Dieselben zwei
 * Merkmale wie bei `isUnknownHostError` (Code ODER Statustext, weil `data.code`
 * die Serialisierung zur Fehlerseite nicht zuverlässig überlebt) — und 503 ist
 * Pflicht, damit kein anderer Fehler diesen Satz bekommt.
 */
export function isTenantResolverMissingError(error: UnknownHostErrorLike | null | undefined): boolean {
  if (!error) return false
  if (statusOf(error) !== 503) return false
  if (codeOf(error.data) === TENANT_RESOLVER_MISSING_CODE) return true
  return error.statusMessage === TENANT_RESOLVER_MISSING_STATUS_TEXT || error.statusText === TENANT_RESOLVER_MISSING_STATUS_TEXT
}

/**
 * Kann dieser Host gerade GAR NICHTS bedienen? Unbekannter Host (404) oder
 * Trennung ohne Resolver (503) — in beiden Fällen antwortet jede API mit
 * demselben Fehler, und ein Plugin, das trotzdem startet, läuft nur in einen
 * Wiederholungs-Takt (s. `startWhenHostResolves`).
 */
export function isHostUnservedError(error: UnknownHostErrorLike | null | undefined): boolean {
  return isUnknownHostError(error) || isTenantResolverMissingError(error)
}
