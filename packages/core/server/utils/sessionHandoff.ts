import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { createAdminClient, setSessionCookie } from '../lib/appwrite'
import type { HandoffGrant } from './embedHandoff'
import { logEvent } from './logEvent'
import { readRequestSession, type SessionCookieCard } from './requestSession'
import { forgetRequestSession } from './sessionAccount'
import { siteCardSettings } from './siteCard'
import { softFail } from './softFail'

/**
 * HOST-WECHSEL MIT EIGENER SITZUNG JE SEITE (PK1 E1b; Plan
 * `docs/plans/PUKALANI-KONTO-E1.md`, § 5 Variante A, § 13.2 und § 13.4).
 *
 * Vor E1b bekam der Ziel-Host eine KOPIE des Geheimnisses der Quelle. Im
 * Modus `write` des Kartenschalters bekommt er stattdessen eine EIGENE
 * Appwrite-Sitzung (`users.createSession` am Admin-Client) in einer Karte für
 * genau diesen Host. Abmelden auf einer Seite beendet dann nur deren Sitzung.
 *
 * AUSNAHMEN (bekommen die Kopie, aber in einer Karte, an Host und Community
 * gebunden):
 *  - Konten mit zwei Faktoren (Davids Entscheidung (a), § 13.4): eine neue
 *    Sitzung trüge nur einen Faktor.
 *  - `users.createSession` scheitert oder der Admin-Client fehlt: lieber die
 *    Kopie als ein ausgesperrter Mensch (Zeile `soft_fail`/Log).
 *
 * Mit `off`/`read` ändert sich nichts: Kopie im Klartext wie vor E1.
 */

/**
 * Was die QUELLE ins Siegel legt. Bei `off`/`read` nur das Geheimnis (Format
 * wie vor E1b); bei `write` dazu Konto, Sitzung und ursprüngliche Anmeldung
 * aus der Karte. Bei einer Klartext-Quelle fehlen Sitzung und Zeitpunkt — das
 * Ziel nimmt dann die Angaben der geprüften Quell-Sitzung.
 */
export function requestHandoffGrant(event: H3Event): HandoffGrant | null {
  const session = readRequestSession(event)
  if (!session) return null
  if (siteCardSettings().mode !== 'write') return { secret: session.secret }
  if (session.format === 'card') {
    return {
      secret: session.secret,
      userId: session.claims.userId,
      sessionId: session.claims.sessionId,
      authAt: session.claims.authAt,
    }
  }
  const userId = event.context.user?.$id
  return userId ? { secret: session.secret, userId } : { secret: session.secret }
}

/**
 * Passt das Siegel zur Sitzung, die Appwrite für sein Geheimnis meldet?
 * Ein Siegel ohne Zusatzfelder (altes Format) passt immer.
 */
export function handoffMatchesSession(grant: HandoffGrant, session: Pick<Models.Session, '$id' | 'userId'>): boolean {
  if (grant.userId !== undefined && grant.userId !== session.userId) return false
  if (grant.sessionId !== undefined && grant.sessionId !== session.$id) return false
  return true
}

/**
 * Zeitpunkt der ursprünglichen Anmeldung: aus dem Siegel, sonst `$createdAt`
 * der Quell-Sitzung. Unlesbar ⇒ 0 (für die Frische-Prüfung „uralt", also nur
 * strenger).
 */
export function handoffAuthAt(grant: HandoffGrant, session: Pick<Models.Session, '$createdAt'>): number {
  if (typeof grant.authAt === 'number' && Number.isFinite(grant.authAt)) return grant.authAt
  const created = Date.parse(session.$createdAt)
  return Number.isFinite(created) ? created : 0
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Braucht dieses Konto bei der Anmeldung zwei Faktoren?
 *
 * Appwrites Regel: `mfa` am Konto AN und mindestens ein zweiter Faktor
 * verfügbar (verifizierte E-Mail, verifiziertes Telefon, bestätigter
 * Authenticator). `users.get` liefert `mfa`, `emailVerification` und
 * `phoneVerification`; den Authenticator sagt erst `users.listMfaFactors`.
 * Im Zweifel (Lesefehler) gilt „braucht zwei" — dann bekommt das Ziel die
 * Kopie wie vor E1b, nie eine Sitzung, die Appwrite ablehnen würde.
 */
export async function accountNeedsSecondFactor(admin: AdminClient, userId: string): Promise<boolean> {
  const user = await admin.users.get({ userId }).catch(softFail('core:utils/sessionHandoff:usersGet', null))
  if (!user) return true
  if (user.mfa !== true) return false
  if (user.emailVerification === true || user.phoneVerification === true) return true
  const factors = await admin.users.listMfaFactors({ userId }).catch(softFail('core:utils/sessionHandoff:listMfaFactors', null))
  if (!factors) return true
  return factors.totp === true || factors.email === true || factors.phone === true || factors.custom === true
}

/**
 * Am Ziel-Host: Cookie für die geprüfte Quell-Sitzung setzen.
 * Vorbedingung: das Siegel ist offen, Appwrite hat die Quell-Sitzung bestätigt
 * und `handoffMatchesSession` ist wahr.
 */
export async function establishSiteSession(event: H3Event, grant: HandoffGrant, source: Models.Session): Promise<void> {
  const authAt = handoffAuthAt(grant, source)
  const copy: SessionCookieCard = { sessionId: source.$id, userId: source.userId, authAt, own: false }
  const settings = siteCardSettings()
  // `off`/`read`, und `write` ohne Schlüssel (dort entsteht ohnehin keine
  // Karte): Kopie wie vor E1b.
  if (settings.mode !== 'write' || settings.keys.length === 0) {
    setSessionCookie(event, grant.secret, source.expire, { card: copy })
    return
  }

  let admin: AdminClient | null = null
  try {
    admin = createAdminClient(event)
  }
  catch (error) {
    logEvent('warn', 'auth.site_session_copy_fallback', { reason: 'admin_client_unavailable', status: (error as { status?: unknown })?.status ?? null })
  }
  if (!admin || await accountNeedsSecondFactor(admin, source.userId)) {
    setSessionCookie(event, grant.secret, source.expire, { card: copy })
    return
  }

  const created = await admin.users.createSession({ userId: source.userId })
    .catch(softFail('core:utils/sessionHandoff:createSession', null))
  if (!created?.secret || !created.$id || created.userId !== source.userId) {
    if (created) logEvent('warn', 'auth.site_session_copy_fallback', { reason: 'session_incomplete' })
    setSessionCookie(event, grant.secret, source.expire, { card: copy })
    return
  }

  // Aufräumen: trägt die Anfrage schon die EIGENE Sitzung dieses Kontos für
  // diesen Host (Karte, `own`), wird sie durch die neue ersetzt. Eine Kopie
  // (Zwei-Faktor, Rückfall, alte Karte ohne Merkmal) und die Quell-Sitzung
  // bleiben immer stehen.
  const previous = readRequestSession(event)
  if (
    previous?.format === 'card'
    && previous.claims.own === true
    && previous.claims.userId === source.userId
    && previous.claims.sessionId !== source.$id
    && previous.claims.sessionId !== created.$id
  ) {
    await admin.users.deleteSession({ userId: source.userId, sessionId: previous.claims.sessionId })
      .catch(softFail('core:utils/sessionHandoff:deleteSession', undefined))
    // Die ersetzte Sitzung gilt ab hier auch im Anmelde-Merker nicht mehr.
    forgetRequestSession(event)
  }

  setSessionCookie(event, created.secret, created.expire, {
    card: { sessionId: created.$id, userId: source.userId, authAt, own: true },
  })
}
