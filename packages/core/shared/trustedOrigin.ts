/**
 * WOHER KOMMT DIE ADRESSE IN EINEM MAIL-LINK ODER OAUTH-RÜCKWEG? (SEC-010,
 * seit 2026-11-16 — Davids Entscheidung.)
 *
 * Bis dahin bauten Reset-Mail und OAuth-Start sie aus dem `Host` der Anfrage.
 * Den setzt der Aufrufer: eine Anfrage mit fremdem Host (über die IP direkt,
 * oder über einen Proxy, der ihn durchreicht) hätte einen Reset-Link auf eine
 * fremde Seite in eine echte Mail gelegt — wer ihn anklickt, schickt sein
 * Reset-Geheimnis dorthin.
 *
 * REGEL:
 *  - Mandanten-Auflösung an UND sie hat den Host geprüft (Pool-Community,
 *    Kundendomain, Kontroll-Host) ⇒ der Host der Anfrage. Ein unbekannter
 *    Host endet in `00.tenant.ts` mit 404, bevor eine Route läuft; was hier
 *    ankommt, ist also ein Name, den das Control Plane kennt.
 *  - Sonst (branding, portfolio, control, …) ⇒ `public.appUrl`. Der Name aus
 *    der Anfrage ist dort von niemandem geprüft.
 *  - Fehlt `appUrl` (oder ist er keine http(s)-Adresse) ⇒ Rückfall auf die
 *    Anfrage, aber NICHT still: der Aufrufer schreibt eine Fehlerzeile.
 *    Reihenfolge-Regel einer neuen Pflicht-Variable (hosts-ops.md): der Code
 *    läuft mit Rückfall, bis der Wert auf jedem Server steht. Im Dev-Server
 *    ist der Rückfall gewollt und bleibt ohne Zeile.
 */

export type TrustedOriginSource = 'tenant-host' | 'app-url' | 'request-fallback'

export interface TrustedOrigin {
  origin: string
  source: TrustedOriginSource
}

export interface TrustedOriginInput {
  /** `pukalani.tenancy.enabled === true` */
  tenancyEnabled: boolean
  /** Hat `00.tenant.ts` den Host belegt (Mandant oder Kontroll-Host)? */
  hostVerified: boolean
  /** Origin der Anfrage (`getRequestURL(event).origin`) */
  requestOrigin: string
  /** `runtimeConfig.public.appUrl` */
  appUrl: string | null | undefined
  dev: boolean
}

/** `appUrl` als Origin — nur http(s), ohne Pfad und Schluss-Slash; sonst `null`. */
export function appUrlOrigin(appUrl: string | null | undefined): string | null {
  const trimmed = (appUrl ?? '').trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  }
  catch {
    return null
  }
}

export function decideTrustedOrigin(input: TrustedOriginInput): TrustedOrigin {
  if (input.tenancyEnabled && input.hostVerified) {
    return { origin: input.requestOrigin, source: 'tenant-host' }
  }
  const configured = appUrlOrigin(input.appUrl)
  if (configured) return { origin: configured, source: 'app-url' }
  return { origin: input.requestOrigin, source: 'request-fallback' }
}

/** Soll der Rückfall gemeldet werden? Im Dev-Server nie. */
export function shouldReportAppUrlMissing(result: TrustedOrigin, dev: boolean): boolean {
  return result.source === 'request-fallback' && !dev
}

/**
 * Die Fehlerzeile — fester Marker für die Suche im Log, OHNE den Host der
 * Anfrage (der ist ja gerade der ungeprüfte Wert) und ohne Mail-Adresse.
 */
export const APP_URL_MISSING_LOG_LINE
  = '[core] auth.app_url_missing: NUXT_PUBLIC_APP_URL fehlt oder ist keine http(s)-Adresse — Link aus dem Namen der Anfrage'
