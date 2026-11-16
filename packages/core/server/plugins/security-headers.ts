import type { H3Event } from 'h3'
import { resolveFrameAncestors } from '../utils/frameAncestors'
import { analyticsScriptOrigins } from '../../shared/analyticsScript'
import { TURNSTILE_SCRIPT_ORIGIN, baseSecurityHeaders, scriptCspReportOnly } from '../../shared/securityHeaders'

/**
 * SCHUTZ-KOPFZEILEN (Embed-Vorarbeit E0, seit 2026-11-16 SEC-006) — zwei
 * Haken, zwei Reichweiten.
 *
 * `request` läuft für JEDE Antwort: Seiten, `/api/*`, `/_nuxt/*`,
 * public-Dateien, Fehler. Hier stehen die Kopfzeilen, die für alles gelten
 * (`shared/securityHeaders.ts`). Bewusst SO FRÜH: eine Route oder Middleware,
 * die strenger sein will (`referrer-policy: no-referrer` auf einer Seite mit
 * Token in der Adresse), setzt ihren Wert danach selbst und gewinnt, weil
 * `setResponseHeader` ersetzt statt anzuhängen.
 *
 * `render:response` trifft nur SSR-Seiten: `frame-ancestors` (nur Dokumente
 * werden geframet; der Wert entsteht allein in `utils/frameAncestors.ts`),
 * die beobachtende Skript-CSP und das Entfernen von `x-powered-by: Nuxt`.
 *
 * Die Haken-Logik steht als benannte Funktionen da, damit der Test sie an
 * einer echten h3-App laufen lassen kann (`tests/securityHeaders.test.ts`).
 */

/**
 * Den Host ROH aus der Kopfzeile, NICHT über `getRequestURL`: dieser Haken
 * läuft VOR `00.host-header.ts`, ein kaputter Host würde dort werfen — und
 * Nitro verschluckt Fehler aus dem `request`-Haken still, die Antwort ginge
 * dann ganz ohne Schutz-Kopfzeilen hinaus. Für die einzige Frage hier
 * („lokal oder nicht?") reicht der rohe Wert.
 */
export function applyBaseSecurityHeaders(event: H3Event): void {
  setResponseHeaders(event, baseSecurityHeaders(getHeader(event, 'host')))
}

/**
 * Nitro reicht `response.headers` als Abbild der Node-Antwort herein (Nuxts
 * Renderer kopiert alles, was am Event steht, hinein und setzt es danach
 * erneut). Darum stehen die Basis-Kopfzeilen aus dem `request`-Haken hier
 * schon drin und werden NICHT doppelt: `setResponseHeaders` ersetzt je Name.
 * Was eine Middleware am Event gesetzt hat, wandert mit und überlebt — wie
 * in `html-no-cache.ts`.
 *
 * `x-powered-by` muss an BEIDEN Stellen weg: Nuxt setzt es auch direkt am
 * Event, ein Löschen nur im Objekt käme beim Absenden wieder.
 */
export async function applyDocumentSecurityHeaders(
  response: { headers?: Record<string, string> },
  event: H3Event,
  options: { reportOnly: boolean, extraScriptOrigins: string[] },
): Promise<void> {
  const value = await resolveFrameAncestors(event, getRequestURL(event).pathname)
  removeResponseHeader(event, 'x-powered-by')
  const headers: Record<string, string> = { ...response.headers }
  delete headers['x-powered-by']
  headers['content-security-policy'] = `frame-ancestors ${value}`
  if (options.reportOnly) {
    headers['content-security-policy-report-only'] = scriptCspReportOnly(options.extraScriptOrigins)
  }
  response.headers = headers
}

/**
 * Fremde Skript-Quellen, die der Client-Code WIRKLICH lädt (per Suche
 * belegt, 2026-11-16): Turnstile und das Analytics-Skript. Kommt eine dazu,
 * gehört sie hier hinein — sonst meldet die Konsole sie als Verstoß.
 */
function knownScriptOrigins(): string[] {
  const appConfig = useAppConfig() as {
    pukalani?: { analytics?: { enabled?: boolean, provider?: string, src?: string, instance?: string } }
  }
  return [TURNSTILE_SCRIPT_ORIGIN, ...analyticsScriptOrigins(appConfig.pukalani?.analytics)]
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    applyBaseSecurityHeaders(event)
  })
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    // Im Dev-Server bleibt die Skript-CSP aus: dort schieben Vite und die
    // DevTools eigene Skripte ein, und eine Meldung daraus sagte nichts über
    // das, was ausgeliefert wird.
    const reportOnly = !import.meta.dev
    await applyDocumentSecurityHeaders(response, event, {
      reportOnly,
      extraScriptOrigins: reportOnly ? knownScriptOrigins() : [],
    })
  })
})
