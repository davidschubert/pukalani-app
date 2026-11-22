import { readRequestSession } from '../../utils/requestSession'
import { siteCardActive } from '../../utils/siteCard'

/**
 * Kurzlebiger JWT für authentifiziertes Realtime. In der SSR-Cookie-Architektur
 * kennt der Web-SDK-Client keine Session → der Realtime-WS verbindet sonst als
 * Gast und empfängt keine `read("users")`-Presence-Events. Der Client setzt
 * diesen JWT (`client.setJWT`) vor dem Subscribe; die WS-URL trägt ihn dann.
 *
 * Härtung (bewusstes Restrisiko, dokumentiert): Appwrite-JWTs sind nicht auf
 * Realtime scopebar — der Token ist ein vollwertiger Session-JWT im JS-Speicher.
 * Relevant nur bei bestehendem XSS; Gegenmaßnahmen: kurze Dauer (15 min statt
 * max. 1h, Client erneuert rechtzeitig) + Rate-Limit auf dem Mint (Middleware).
 *
 * AN DIE SITZUNG DER KARTE GEBUNDEN (PK1 E1b): ohne `sessionId` bindet
 * Appwrite das JWT an die NEUESTE Sitzung des Kontos — mit einer Sitzung je
 * Seite wäre das oft eine andere Seite. Trägt die Anfrage eine Karte, geht
 * deren Sitzung mit; das JWT endet dann genau mit ihr. Ohne Karte unverändert.
 */
const JWT_DURATION_S = 900

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  // node-appwrite 28: `account.createJWT` ist entfernt — geminzt wird am
  // ADMIN-Client (`users.createJWT`). Die userId stammt AUSSCHLIESSLICH aus
  // `event.context.user` (von der Auth-Middleware aus der Session aufgelöst),
  // nie aus Query oder Body: sonst könnte man sich ein JWT für ein fremdes
  // Konto ausstellen lassen.
  const { users } = createAdminClient(event)
  const current = siteCardActive() ? readRequestSession(event) : null
  const sessionId = current?.format === 'card' && current.claims.userId === event.context.user.$id ? current.claims.sessionId : undefined
  // Session kann zwischen Middleware und Route abgelaufen sein → 401, nicht 500.
  const { jwt } = await users.createJWT({ userId: event.context.user.$id, ...(sessionId ? { sessionId } : {}), duration: JWT_DURATION_S })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return { jwt }
})
