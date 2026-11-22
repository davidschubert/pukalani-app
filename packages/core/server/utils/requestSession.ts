import type { H3Event } from 'h3'
import { sessionCookieName } from '../lib/appwrite'
import { normalizeHost } from './tenantResolver'
import { openSiteCard, siteCardSettings } from './siteCard'
import { isCustomDomainHost, looksLikeSiteCard, siteCardCommunityOf, type SiteCardClaims } from '../../shared/siteCard'

/**
 * DER EINE LESEPUNKT DES SITZUNGS-COOKIES (PK1 E1a).
 *
 * Jede Stelle, die das Appwrite-Geheimnis der Anfrage braucht (Session-Client,
 * Anmelde-Middleware, Anmelde-Merker, Siegel für Host-Wechsel und Einbettung,
 * Türsteher), fragt HIER — nie `getCookie` auf den Sitzungs-Namen. Nur so
 * versteht jede Stelle beide Formate, und nur so wirkt der Schalter überall
 * gleich. Wächter: `packages/core/tests/sessionCookieReadGuard.test.ts`.
 *
 * Ergebnis: das innere Geheimnis + Format (`plain` | `card`, bei `card` die
 * Ansprüche) oder `null` („keine gültige Sitzung im Cookie").
 *
 * - Modus `off`: genau der Cookie-Wert wie vor E1, ohne Zwischenspeicher.
 * - `read`: eine Karte wird geöffnet (Host der Anfrage, Community, zu der der
 *   Host JETZT gehört); eine ungültige Karte ist `null`. Klartext gilt weiter.
 * - `write`: wie `read`, aber auf einer eigenen Domain einer Community
 *   (`isCustomDomainHost`) gilt Klartext NICHT.
 * Mit Karten wird je Anfrage einmal gerechnet (an das Event gebunden).
 */

export type RequestSession =
  | { secret: string, format: 'plain' }
  | { secret: string, format: 'card', claims: SiteCardClaims }

const perRequest = new WeakMap<H3Event, RequestSession | null>()

function resolve(event: H3Event, raw: string | undefined): RequestSession | null {
  if (!raw) return null
  const settings = siteCardSettings()
  const host = normalizeHost(getHeader(event, 'host'))
  const tenant = event.context.tenant

  if (looksLikeSiteCard(raw)) {
    const claims = openSiteCard(raw, {
      host,
      communityId: siteCardCommunityOf(tenant),
      now: Date.now(),
      keys: settings.keys,
      cookieName: sessionCookieName(event),
    })
    return claims ? { secret: claims.secret, format: 'card', claims } : null
  }

  if (settings.mode === 'write' && isCustomDomainHost(host, tenant)) return null
  return { secret: raw, format: 'plain' }
}

/** Die Sitzung dieser Anfrage — siehe Kopf. */
export function readRequestSession(event: H3Event): RequestSession | null {
  if (siteCardSettings().mode === 'off') {
    const raw = getCookie(event, sessionCookieName(event))
    return raw ? { secret: raw, format: 'plain' } : null
  }
  if (perRequest.has(event)) return perRequest.get(event) ?? null
  const session = resolve(event, getCookie(event, sessionCookieName(event)))
  perRequest.set(event, session)
  return session
}

/** Kurzform: nur das innere Geheimnis (oder `undefined`). */
export function requestSessionSecret(event: H3Event): string | undefined {
  return readRequestSession(event)?.secret
}
