import type { H3Event } from 'h3'
import { isControlHost } from '../../shared/controlCenter'
import { parseCentralLoginMode, parseSiteHost, type CentralLoginMode } from '../../shared/centralLogin'
import { controlHosts } from './controlCenter'
import { getTenantResolver, normalizeHost } from './tenantResolver'

/**
 * ZENTRALE ANMELDUNG, Server-Seite (PK1 E2, Prototyp der Variante A — Kopf
 * und Schalter: `shared/centralLogin.ts`).
 *
 * DAS RÜCKSPRUNG-ZIEL IST DIE EINZIGE HEIKLE STELLE: wer hier eine fremde
 * Adresse durchließe, bekäme ein Siegel für seine eigene Seite und damit die
 * Anmeldung des Opfers (der Befund vom 2026-08-02, nur in die Gegenrichtung).
 * Darum gilt ein Host nur, wenn
 *  (1) der Schalter `on` ist und die Trennung (`pukalani.tenancy`) läuft,
 *  (2) DIESE Anfrage auf einem Kontroll-Host ankommt (der Kundenbereich ist
 *      die zentrale Stelle, nie eine Community),
 *  (3) der Wert wie ein Host aussieht (`parseSiteHost`),
 *  (4) er KEIN Kontroll-Host ist,
 *  (5) die Mandanten-Auflösung DIESES Deployments ihn als Community kennt.
 * Zurück geht es auf den kanonischen Host der Community aus der Auflösung,
 * nie auf einen Wert aus dem Aufruf.
 */

export function centralLoginMode(event?: H3Event): CentralLoginMode {
  const config = useRuntimeConfig(event) as { public?: { centralLogin?: unknown } }
  return parseCentralLoginMode(config.public?.centralLogin)
}

/** Läuft die zentrale Anmeldung auf DIESER Anfrage (Schalter an, Kontroll-Host)? */
export function isCentralLoginHost(event: H3Event): boolean {
  if (centralLoginMode(event) !== 'on') return false
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  if (appConfig.pukalani?.tenancy?.enabled !== true) return false
  return isControlHost(normalizeHost(getHeader(event, 'host')), controlHosts(event))
}

export interface CentralReturnTarget {
  /** Kanonischer Host der Community — hierhin geht das Siegel. */
  host: string
  /** Anzeigename („Anmelden bei …"), leer, wenn die Community keinen hat. */
  name: string
}

/**
 * Prüft `rawSite` streng (Regeln oben). `null` heißt „kein bekannter Host";
 * der Aufrufer antwortet dann 404, ohne zu sagen, welche Regel griff.
 */
export async function resolveCentralReturn(event: H3Event, rawSite: unknown): Promise<CentralReturnTarget | null> {
  if (!isCentralLoginHost(event)) return null
  const site = parseSiteHost(rawSite)
  if (!site) return null
  if (isControlHost(site, controlHosts(event))) return null
  const resolver = getTenantResolver()
  if (!resolver) return null
  const tenant = await resolver(site)
  if (!tenant) return null
  const canonical = parseSiteHost(normalizeHost(tenant.canonicalHost)) ?? site
  // Auch der kanonische Host darf kein Kontroll-Host sein (Netz für eine
  // falsch gepflegte Zeile).
  if (isControlHost(canonical, controlHosts(event))) return null
  return { host: canonical, name: typeof tenant.name === 'string' ? tenant.name : '' }
}
