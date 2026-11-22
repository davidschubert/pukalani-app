import { readRequestSession } from '../../utils/requestSession'
import { isLiveTicketRequest, LIVE_CHECK_HEADER, LIVE_JWT_DURATION_S, liveRelayHooks } from '../../utils/liveRelay'
import { logEvent } from '../../utils/logEvent'
import { isAuthBackendOutage } from '../../../shared/authFailure'
import { liveRelayReady } from '../../utils/siteCard'
import { siteCardCommunityOf } from '../../../shared/siteCard'

/**
 * `/api/live/realtime` — die Live-Verbindung unter einer eigenen Domain über
 * UNSEREN Server (PK1 E1d, Plan § 13.3 Weg 3). Zwei Gesichter:
 *
 * 1. WEBSOCKET (`websocket`): der Browser (Web-SDK, Endpunkt `/api/live`)
 *    verbindet sich hierher; Dienst und Regeln in
 *    `core/server/utils/liveRelay.ts` und `core/shared/liveRelay.ts`.
 * 2. HTTP-GET: antwortet NUR dem Dienst selbst (Prozess-Geheimnis in einer
 *    Kopfzeile, `isLiveTicketRequest`) mit der Fahrkarte. Jede andere Anfrage
 *    — und jede mit Schalter aus — bekommt 404 wie eine unbekannte Route. Die
 *    Fahrkarte (ein JWT) verlässt den Prozess so nie.
 *
 * Bis hierher ist die ganze Middleware-Kette gelaufen: Host, Mandant, eigene
 * Domain (`01.custom-domain-scope.ts` setzt `customDomainScope`, die Route
 * steht auf ihrer Erlaubnisliste), Karte und Anmeldung (`02.auth.ts`),
 * entfernte Mitglieder (`06.community-removed.ts`).
 *
 * Die Fahrkarte gibt es nur, wenn:
 *  - der Dienst bereit ist (Modus `write`, Schlüssel, WebSocket im Build);
 *  - die Anfrage auf der EIGENEN DOMAIN einer Pool-Community läuft;
 *  - das Cookie eine gültige KARTE ist (kein Klartext) und die Anmeldung
 *    zu genau diesem Konto gehört;
 *  - die Sitzung der Karte bei Appwrite JETZT lebt (keine Zwischenspeicher)
 *    und noch mindestens eine Minute vor sich hat.
 * Das JWT ist an die SITZUNG DER KARTE gebunden (`users.createJWT` mit
 * `sessionId`): endet sie, schließt Appwrite die Verbindung oben sofort.
 */
const MIN_DURATION_S = 60

/** Appwrite nicht erreichbar ⇒ 503 mit Log-Zeile; abgelehnt ⇒ 401 (AB1 d). */
function appwriteRefused(step: string) {
  return (error: unknown): never => {
    if (isAuthBackendOutage(error)) {
      logEvent('error', 'live_relay.appwrite_unavailable', { step })
      throw createError({ status: 503, statusText: 'Service Unavailable' })
    }
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
}

/**
 * Dieselbe Antwort wie für einen Pfad, den es nicht gibt (Nuxts früher 404,
 * `early-404.js`): mit Schalter aus soll die Route nicht zu erkennen sein.
 */
function notFound(path: string) {
  return createError({ status: 404, statusText: `Page not found: ${path}`, data: { path } })
}

export default defineEventHandler({
  handler: async (event) => {
    if (!isLiveTicketRequest(event) || !liveRelayReady()) throw notFound(event.path)
    const tenant = event.context.tenant
    if (event.context.customDomainScope !== true || tenant?.mode !== 'pool') throw notFound(event.path)
    const user = event.context.user
    const session = readRequestSession(event)
    if (!user || session?.format !== 'card' || session.claims.userId !== user.$id) {
      throw createError({ status: 401, statusText: 'Unauthorized' })
    }
    if (event.context.communityRemoved === true) {
      throw createError({ status: 403, statusText: 'Forbidden' })
    }
    const communityId = siteCardCommunityOf(tenant)
    if (!communityId || !tenant.tenantId || session.claims.communityId !== communityId) {
      throw createError({ status: 401, statusText: 'Unauthorized' })
    }
    const scope = { userId: user.$id, communityId, tenantId: tenant.tenantId }
    // NACHPRÜFUNG einer offenen Verbindung (Kopfzeile vom Dienst selbst):
    // dieselbe Kette bis hier, kein JWT, keine Sitzungs-Frage — eine beendete
    // Sitzung schließt Appwrite oben ohnehin sofort.
    if (getHeader(event, LIVE_CHECK_HEADER) === '1') {
      if (session.claims.expiresAt <= Date.now()) throw createError({ status: 401, statusText: 'Unauthorized' })
      setHeader(event, 'cache-control', 'no-store')
      return { scope }
    }
    const now = Date.now()
    const duration = Math.min(LIVE_JWT_DURATION_S, Math.floor((session.claims.expiresAt - now) / 1000))
    if (duration < MIN_DURATION_S) {
      throw createError({ status: 401, statusText: 'Unauthorized' })
    }
    // DIE SITZUNG LEBT JETZT — direkt bei Appwrite gefragt, nicht aus dem
    // Anmelde-Merker (`02.auth.ts` hält eine Anmeldung kurz zwischen) und
    // nicht aus `users.createJWT` (das prüft die Sitzung nicht: gemessen auf
    // der Bühne, ein JWT für eine gelöschte Sitzung entstand). Ohne diese
    // Frage nähme der Dienst nach einem Widerruf noch eine neue Verbindung an.
    const current = await createSessionClient(event).account.getSession({ sessionId: 'current' })
      .catch(appwriteRefused('get_session'))
    if (current.$id !== session.claims.sessionId || current.userId !== user.$id) {
      throw createError({ status: 401, statusText: 'Unauthorized' })
    }
    const { users } = createAdminClient(event)
    const { jwt } = await users.createJWT({ userId: user.$id, sessionId: session.claims.sessionId, duration })
      .catch(appwriteRefused('create_jwt'))
    setHeader(event, 'cache-control', 'no-store')
    const avatarUrl = (user.prefs as { avatarUrl?: unknown } | undefined)?.avatarUrl
    return {
      scope,
      profile: { userName: typeof user.name === 'string' ? user.name : '', ...(typeof avatarUrl === 'string' && avatarUrl ? { avatarUrl } : {}) },
      projectId: tenant.projectId,
      jwt,
      expiresAt: now + duration * 1000,
    }
  },
  websocket: liveRelayHooks,
})
