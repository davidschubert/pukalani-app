import { safeRedirectTarget } from './redirectTarget'

/**
 * ZENTRALE ANMELDUNG — PROTOTYP DER VARIANTE A (PK1 E2, Plan
 * `docs/plans/PUKALANI-KONTO-E2.md`, § 5 und § 13).
 *
 * Eine Community schickt den Browser zur Anmeldung in den Kundenbereich
 * (`account.*`, Kontroll-Host) und nennt dabei nur, WELCHER Host zurück will.
 * Der Kundenbereich prüft diesen Host streng gegen die bekannten Hosts
 * (Mandanten-Auflösung, `server/utils/centralLogin.ts`), stellt ein Siegel für
 * genau ihn aus, und die Community löst es über `/api/auth/site-session` ein
 * (derselbe Baustein wie der Wechsel aus dem Kundenbereich).
 *
 * SCHALTER: `runtimeConfig.public.centralLogin` (Env
 * `NUXT_PUBLIC_CENTRAL_LOGIN`), `off` · `on`, Vorgabe `off`. Jeder andere
 * Wert ist `off`. Mit `off` ändert sich nichts: die neuen Routen antworten
 * 404, die Seiten-Formulare bleiben, wo sie sind.
 *
 * PURE (unit-getestet): nur Rechnen, kein Netz.
 */

export type CentralLoginMode = 'off' | 'on'

/** Nur das genaue Wort `on` schaltet ein. */
export function parseCentralLoginMode(raw: unknown): CentralLoginMode {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'on' ? 'on' : 'off'
}

/** Längster erlaubter Host (DNS: 253 Zeichen). */
const MAX_HOST = 253

/**
 * Sieht der Wert aus `?site=` wie ein Host aus? Nur Kleinbuchstaben, Ziffern,
 * Punkt und Bindestrich, mindestens ein Punkt oder `localhost`, kein Port,
 * kein Schema, kein Pfad, kein IPv6-Literal. Gibt den Host in Kleinschrift
 * zurück oder `null`. Ob er UNS gehört, sagt erst die Mandanten-Auflösung.
 */
export function parseSiteHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // Kein `trim()`: ein Leerzeichen oder Zeilenumbruch gehört nicht in einen
  // Host, also wird er abgelehnt statt still entfernt.
  const value = raw.toLowerCase()
  if (!value || value.length > MAX_HOST) return null
  if (!/^[a-z0-9.-]+$/.test(value)) return null
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) return null
  if (value.startsWith('-') || value.split('.').some(label => label === '' || label.startsWith('-') || label.endsWith('-'))) return null
  if (!value.includes('.') && value !== 'localhost') return null
  return value
}

/** Lokaler Entwicklungs-Host? Dann `http` und der Port der Anfrage. */
export function isLocalDevHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost')
}

/** Ursprung eines geprüften Hosts (lokal mit Port der Anfrage). */
export function siteOrigin(host: string, requestPort = ''): string {
  if (isLocalDevHost(host)) {
    return requestPort ? `http://${host}:${requestPort}` : `http://${host}`
  }
  return `https://${host}`
}

/**
 * Rücksprung-Adresse auf der Community: das Siegel geht an
 * `/api/auth/site-session`, `to` nur als relativer Pfad (sonst `/`).
 */
export function centralReturnUrl(host: string, token: string, to: unknown, requestPort = ''): string {
  const target = safeRedirectTarget(to) ?? '/'
  return `${siteOrigin(host, requestPort)}/api/auth/site-session?token=${encodeURIComponent(token)}&to=${encodeURIComponent(target)}`
}

/**
 * Adresse der zentralen Anmeldeseite für eine Community. `accountUrl` ist der
 * Ursprung des Kundenbereichs (`useAccountAreaUrl()`), `loginPath` der Pfad
 * der Seite mit Sprach-Präfix (`localePath('/login/continue')`).
 */
export function centralLoginUrl(accountUrl: string, loginPath: string, site: string, to: unknown): string {
  const params = new URLSearchParams({ site })
  const target = safeRedirectTarget(to)
  if (target) params.set('to', target)
  return `${accountUrl}${loginPath}?${params.toString()}`
}
