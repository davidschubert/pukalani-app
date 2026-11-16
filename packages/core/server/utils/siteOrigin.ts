import type { H3Event } from 'h3'
import { httpOrigin } from '../../shared/trustedOrigin'

/**
 * „UNTER WELCHER ADRESSE BIN ICH ZU HAUSE?" — als Registry-Vertrag
 * (seit 2026-11-16).
 *
 * WOFÜR: eine Einzel-Site (Silo) hat eine Standard-Adresse
 * (`NUXT_PUBLIC_APP_URL`, z. B. `portfolio.pukalani.app`) und kann im
 * Dashboard eine EIGENE Domain bekommen (`pukalani.studio`). Seiten folgen ihr
 * von selbst (301 + Host der Anfrage), Mail-Links und OAuth-Rückwege nicht:
 * sie bauen ihre Adresse ohne Anfrage-Host (SEC-010) und nahmen deshalb immer
 * die Standard-Adresse. Ein Betreiber soll für eine eigene Domain keine
 * Server-Datei anfassen müssen — also fragen sie hier.
 *
 * WARUM EIN VERTRAG: die Wahrheit steht in der `websites`-Zeile des Control
 * Plane, und die Frage dorthin stellt der `domains`-Layer (A14: core hängt nie
 * an einem Produkt). Derselbe Bau wie `registerCommunityHostResolver`: core
 * beschreibt die FRAGE, der Layer verdrahtet die ANTWORT
 * (`packages/domains/server/plugins/site-origin.ts`).
 *
 * SICHERHEIT (SEC-010): der Resolver bekommt das Event nur für die
 * Laufzeit-Konfiguration. Ein Name aus der Anfrage darf die Antwort NIE
 * bestimmen — sonst wäre das genau die Lücke, die SEC-010 geschlossen hat,
 * nur eine Ebene tiefer.
 *
 * OHNE EVENT (Digest-Lauf im Takt): erlaubt. Die Frage ist eine nach der
 * Site, nicht nach einem Besucher.
 *
 * FAIL-SOFT: kein Resolver (Pool, branding, control, CI), keine aktive
 * Domain, keine Antwort oder ein Fehler ⇒ `null`, und der Aufrufer nimmt
 * `appUrl`. Die Standard-Adresse leitet per 301 weiter, es bricht also nichts.
 */

/** Liefert die aktive eigene Domain als Origin (`https://name`) oder `null`. */
export type SiteOriginResolver = (event: H3Event | undefined) => Promise<string | null> | string | null

let siteOriginResolver: SiteOriginResolver | null = null

/** Von einem Layer (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerSiteOriginResolver(fn: SiteOriginResolver): void {
  if (siteOriginResolver) {
    console.warn('[core] registerSiteOriginResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  siteOriginResolver = fn
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetSiteOriginResolver(): void {
  siteOriginResolver = null
}

/** Die aktive eigene Domain der Site als Origin, sonst `null`. Wirft nie. */
export async function resolveSiteOrigin(event?: H3Event): Promise<string | null> {
  if (!siteOriginResolver) return null
  try {
    return httpOrigin(await siteOriginResolver(event))
  }
  catch {
    // Fail-soft: die Mail geht mit der Standard-Adresse raus (siehe Kopf).
    return null
  }
}

/**
 * Die Link-Basis einer Mail ohne Community-Bezug: eigene Domain, sonst
 * `appUrl` (ohne Schluss-Slash), sonst ''. '' heißt für den Aufrufer
 * „keine Adresse" — er entscheidet, ob er dann ablehnt oder überspringt.
 */
export async function resolveSiteLinkBase(event?: H3Event): Promise<string> {
  const site = await resolveSiteOrigin(event)
  if (site) return site
  return (useRuntimeConfig(event).public.appUrl || '').replace(/\/+$/, '')
}
