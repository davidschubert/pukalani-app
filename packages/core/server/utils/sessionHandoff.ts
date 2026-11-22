import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { createAdminClient, setSessionCookie } from '../lib/appwrite'
import type { HandoffGrant } from './embedHandoff'
import { logEvent } from './logEvent'
import { readRequestSession, type SessionCookieCard } from './requestSession'
import { forgetRequestSession } from './sessionAccount'
import { siteCardSettings } from './siteCard'
import { softFail } from './softFail'
import { normalizeHost } from './tenantResolver'
import { isCustomDomainHost } from '../../shared/siteCard'

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
 *  - Siegel der alten Fassung (ohne Kennung) oder eine Karte lässt sich nicht
 *    schreiben (kein Schlüssel, kein Host, kein Ablauf): eine neue Sitzung
 *    entsteht nur, wenn sie einmalig eingelöst UND als Karte abgelegt wird.
 *
 * Ein Siegel wird im Modus `write` NIE auf einer eigenen Domain einer
 * Community ausgestellt, wenn es den Host verlässt (`requestHandoffGrant`).
 *
 * Mit `off`/`read` ändert sich nichts: Kopie im Klartext wie vor E1.
 */

/**
 * Was die QUELLE ins Siegel legt. Bei `off`/`read` nur das Geheimnis (Format
 * wie vor E1b); bei `write` dazu Konto, Sitzung und ursprüngliche Anmeldung
 * aus der Karte und eine zufällige Kennung (einmal einlösbar). Bei einer
 * Klartext-Quelle fehlen Sitzung und Zeitpunkt — das Ziel nimmt dann die
 * Angaben der geprüften Quell-Sitzung.
 *
 * `leavesHost`: das Siegel gilt für einen ANDEREN Host (Community-Sprung,
 * Kontroll-Host). Auf einer eigenen Domain einer Community gibt es im Modus
 * `write` dann KEIN Siegel (404 wie eine unbekannte Route): dort gilt die
 * Anmeldung nur für diese Domain. Die Einbettung bleibt auf demselben Host.
 */
export function requestHandoffGrant(event: H3Event, options: { leavesHost: boolean }): HandoffGrant | null {
  const settings = siteCardSettings()
  if (settings.mode === 'write' && options.leavesHost && isCustomDomainHost(normalizeHost(getHeader(event, 'host')), event.context.tenant)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const session = readRequestSession(event)
  if (!session) return null
  // Auch in `read` (dem Rückweg aus `write`) reist der Ablauf einer KARTE
  // mit, sonst schriebe das Ziel eine Kopie bis zum späteren Appwrite-Ablauf
  // einer Seiten-Sitzung (Review B1). In `off` gibt es keine Karte — das
  // Siegel bleibt dort Byte für Byte wie vor E1b.
  if (settings.mode !== 'write') {
    return session.format === 'card' ? { secret: session.secret, expiresAt: session.claims.expiresAt } : { secret: session.secret }
  }
  const nonce = randomBytes(16).toString('base64url')
  if (session.format === 'card') {
    return {
      secret: session.secret,
      userId: session.claims.userId,
      sessionId: session.claims.sessionId,
      authAt: session.claims.authAt,
      expiresAt: session.claims.expiresAt,
      nonce,
    }
  }
  const userId = event.context.user?.$id
  return userId ? { secret: session.secret, userId, nonce } : { secret: session.secret, nonce }
}

/**
 * EINMAL EINLÖSEN: Merker der eingelösten Siegel-Kennungen. Gilt JE PROZESS —
 * das trägt, solange pm2 je App eine Instanz fährt (`.claude/rules/appwrite.md`,
 * „STORE"). Ein Eintrag lebt länger als ein Siegel (`CLAIM_TTL_MS` >
 * `HANDOFF_TTL_MS`), danach lehnt schon der Ablauf im Siegel ab.
 */
const CLAIM_TTL_MS = 2 * 60_000
const CLAIM_MAX = 10_000
const claimed = new Map<string, number>()

/** `true` beim ersten Einlösen dieser Kennung, danach `false`. */
export function claimHandoffOnce(nonce: string, now: number = Date.now()): boolean {
  for (const [key, expires] of claimed) {
    if (expires > now) break
    claimed.delete(key)
  }
  const expires = claimed.get(nonce)
  if (expires !== undefined && expires > now) return false
  if (claimed.size >= CLAIM_MAX) {
    const oldest = claimed.keys().next().value
    if (oldest !== undefined) claimed.delete(oldest)
  }
  claimed.delete(nonce)
  claimed.set(nonce, now + CLAIM_TTL_MS)
  return true
}

/** Nur für Tests: Merker leeren. */
export function resetHandoffClaimsForTests(): void {
  claimed.clear()
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
  // Kein Ziel gilt länger als die Quell-KARTE (Review B1): Appwrite meldet
  // für eine beim Host-Wechsel angelegte Sitzung ihren eigenen, späteren
  // Ablauf — ohne diese Grenze verlängerte jeder Wechsel die Anmeldung.
  const sourceLimit = earliestExpire(source.expire, grant.expiresAt)
  const settings = siteCardSettings()
  // `off`/`read`, und `write` ohne Schlüssel (dort entsteht ohnehin keine
  // Karte): Kopie wie vor E1b.
  if (settings.mode !== 'write' || settings.keys.length === 0) {
    setSessionCookie(event, grant.secret, sourceLimit, { card: copy })
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
    setSessionCookie(event, grant.secret, sourceLimit, { card: copy })
    return
  }

  // Eine neue Sitzung nur, wenn das Siegel einmalig eingelöst wurde (neue
  // Fassung mit Kennung) und sie sicher als Karte abgelegt werden kann. Sonst
  // die Kopie: eine neue Sitzung im Klartext gälte für `requireRecentAuth`
  // als frische Anmeldung.
  const sourceExpires = Date.parse(source.expire)
  if (!grant.nonce || !normalizeHost(getHeader(event, 'host')) || !Number.isFinite(sourceExpires)) {
    setSessionCookie(event, grant.secret, sourceLimit, { card: copy })
    return
  }

  const created = await admin.users.createSession({ userId: source.userId })
    .catch(softFail('core:utils/sessionHandoff:createSession', null))
  if (!created?.secret || !created.$id || created.userId !== source.userId) {
    if (created) logEvent('warn', 'auth.site_session_copy_fallback', { reason: 'session_incomplete' })
    setSessionCookie(event, grant.secret, sourceLimit, { card: copy })
    return
  }

  // Wettlauf mit „überall abmelden"/Passwortwechsel (Review B7): fiel die
  // Quelle weg, während die neue Sitzung entstand, darf die neue nicht
  // stehenbleiben. Darum NACH dem Anlegen nachsehen, ob die Quelle noch
  // lebt. Weg ⇒ neue Sitzung löschen, 401. Lesefehler ⇒ neue Sitzung
  // löschen, Kopie (die lebt nur so lange wie die Quelle selbst).
  const sourceAlive = await admin.users.listSessions({ userId: source.userId, total: false })
    .then(list => list.sessions.some(session => session.$id === source.$id))
    .catch(softFail('core:utils/sessionHandoff:listSessions', null))
  if (sourceAlive !== true) {
    await admin.users.deleteSession({ userId: source.userId, sessionId: created.$id })
      .catch((error: unknown) => {
        const status = (error as { code?: unknown, status?: unknown } | null)?.code ?? (error as { status?: unknown } | null)?.status
        if (status !== 404) logEvent('warn', 'auth.site_session_cleanup_failed', { status: typeof status === 'number' ? status : null })
      })
    if (sourceAlive === false) throw createError({ status: 401, statusText: 'Unauthorized' })
    setSessionCookie(event, grant.secret, sourceLimit, { card: copy })
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
    // Eigene Zeile statt `softFail`: eine stehengebliebene Sitzung ist kein
    // Lesefehler, sondern ein Rest, den der tägliche Wächter zählen soll.
    // 404 heißt „schon weg" und ist kein Fehlschlag.
    await admin.users.deleteSession({ userId: source.userId, sessionId: previous.claims.sessionId })
      .catch((error: unknown) => {
        const status = (error as { code?: unknown, status?: unknown } | null)?.code ?? (error as { status?: unknown } | null)?.status
        if (status !== 404) logEvent('warn', 'auth.site_session_cleanup_failed', { status: typeof status === 'number' ? status : null })
      })
    // Die ersetzte Sitzung gilt ab hier auch im Anmelde-Merker nicht mehr.
    forgetRequestSession(event)
  }

  // Die neue Sitzung gilt nicht länger als die Quelle: Ablauf der Karte =
  // der früheste aus neuer Sitzung, Quell-Sitzung und Quell-Karte.
  const expire = earliestExpire(sourceLimit, created.expire)
  setSessionCookie(event, created.secret, expire, {
    card: { sessionId: created.$id, userId: source.userId, authAt, own: true },
  })
}

/**
 * Der früheste von zwei Abläufen als ISO-Zeit. `first` ist Pflicht (Appwrite-
 * Ablauf), `second` darf fehlen (ms oder ISO); ein ungültiger Wert zählt nicht.
 */
export function earliestExpire(first: string, second: string | number | undefined): string {
  const a = Date.parse(first)
  const b = typeof second === 'number' ? second : typeof second === 'string' ? Date.parse(second) : Number.NaN
  if (!Number.isFinite(b)) return first
  if (!Number.isFinite(a) || b < a) return new Date(b).toISOString()
  return first
}
