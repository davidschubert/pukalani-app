import type { H3Event } from 'h3'
import { sessionCookieName } from '../lib/appwrite'
import { normalizeHost } from './tenantResolver'
import { logEvent } from './logEvent'
import { openSiteCard, sealSiteCard, siteCardSettings } from './siteCard'
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

  // `write`: Klartext gilt nur, wo der Host belegt UNSER ist — nicht auf einer
  // eigenen Domain und nicht auf Pfaden ohne Mandanten-Auflösung (PK1 E1b-2,
  // `event.context.hostUnproven` aus `00.tenant.ts`; sie brauchen keine
  // Anmeldung).
  if (settings.mode === 'write' && (event.context.hostUnproven === true || isCustomDomainHost(host, tenant))) return null
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

/**
 * Nach Abmelden/Widerruf in DERSELBEN Anfrage: der Zwischenspeicher gibt das
 * alte Geheimnis nicht mehr heraus (Gegenlesen E1a, Fund 4). Ruft
 * `clearSessionCookie`.
 */
export function forgetRequestSessionCache(event: H3Event): void {
  perRequest.set(event, null)
}

/** Kurzform: nur das innere Geheimnis (oder `undefined`). */
export function requestSessionSecret(event: H3Event): string | undefined {
  return readRequestSession(event)?.secret
}

/**
 * Was der Schreiber über die Sitzung weiß, die ins Cookie soll (PK1 E1b).
 * Alle Schreibstellen geben es mit (`setSessionCookie`); verwendet wird es
 * nur im Modus `write`.
 */
export interface SessionCookieCard {
  /** Die Appwrite-Sitzung, zu der das Geheimnis gehört. */
  sessionId: string
  /** Das Konto. */
  userId: string
  /** Zeitpunkt der URSPRÜNGLICHEN Anmeldung (ms); echte Anmeldung = jetzt. */
  authAt: number
  /** Gehört die Sitzung nur dieser Seite? (siehe `SiteCardClaims.own`) */
  own: boolean
}

let writeWithoutKeyLogged = false

/**
 * DER EINE SCHREIBPUNKT FÜR DEN WERT DES SITZUNGS-COOKIES (PK1 E1b).
 *
 * - `off`/`read`: genau das Geheimnis (Klartext wie vor E1).
 * - `write` mit Schlüssel: eine Karte, gebunden an den Host der Anfrage und
 *   die Community, zu der er gehört, mit Ablauf der Appwrite-Sitzung.
 * - `write` ohne brauchbaren Schlüssel: Klartext und EINE Log-Zeile je
 *   Prozess. Auf einer eigenen Domain lehnt der Lesepunkt diesen Klartext ab
 *   (gewollt: fail-closed).
 * Fehlt etwas, ohne das keine Karte entstehen darf (Host, Ablauf, Kennungen),
 * bleibt es beim Klartext mit einer Log-Zeile — nie ein Fehler der Anmeldung.
 */
export function sessionCookieValue(event: H3Event, secret: string, expire: string, card: SessionCookieCard): string {
  const settings = siteCardSettings()
  if (settings.mode !== 'write') return secret
  const key = settings.keys[0]
  if (!key) {
    if (!writeWithoutKeyLogged) {
      writeWithoutKeyLogged = true
      logEvent('error', 'site_card.write_without_key', { fallback: 'plain' })
    }
    return secret
  }
  const host = normalizeHost(getHeader(event, 'host'))
  const expiresAt = Date.parse(expire)
  if (!host || !Number.isFinite(expiresAt) || !Number.isFinite(card.authAt) || !card.sessionId || !card.userId) {
    logEvent('error', 'site_card.write_skipped', {
      reason: !host ? 'host_missing' : !Number.isFinite(expiresAt) ? 'expire_invalid' : 'claims_incomplete',
      fallback: 'plain',
    })
    return secret
  }
  return sealSiteCard({
    secret,
    sessionId: card.sessionId,
    userId: card.userId,
    host,
    communityId: siteCardCommunityOf(event.context.tenant),
    expiresAt,
    authAt: card.authAt,
    ...(card.own ? { own: true } : {}),
  }, { key, cookieName: sessionCookieName(event) })
}

/** Nur für Tests: die „einmal je Prozess"-Zeile wieder scharf stellen. */
export function resetSiteCardWriteLogForTests(): void {
  writeWithoutKeyLogged = false
}

/**
 * Karte für eine ECHTE Anmeldung (Passwort, Registrieren, Code, Google): die
 * Sitzung ist neu und gehört dieser Seite, die Anmeldung war jetzt.
 */
export function freshSignInCard(session: { $id: string, userId: string }, now: number = Date.now()): SessionCookieCard {
  return { sessionId: session.$id, userId: session.userId, authAt: now, own: true }
}
