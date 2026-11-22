import { readRequestSession } from '../../utils/requestSession'
import { siteCardSettings } from '../../utils/siteCard'

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
 * deren Sitzung mit; das JWT endet dann genau mit ihr. Im Modus `write` ohne
 * Karte (Klartext) wird die Sitzung der Anfrage bei Appwrite erfragt
 * (`getSession('current')`); scheitert das, 401. Bei `off`/`read` ohne Karte
 * unverändert.
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
  const userId = event.context.user.$id
  const mode = siteCardSettings().mode
  const current = mode === 'off' ? null : readRequestSession(event)
  let sessionId = current?.format === 'card' && current.claims.userId === userId ? current.claims.sessionId : undefined
  if (!sessionId && mode === 'write') {
    const session = await createSessionClient(event).account.getSession({ sessionId: 'current' })
      .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
    if (session.userId !== userId) throw createError({ status: 401, statusText: 'Unauthorized' })
    sessionId = session.$id
  }
  // Session kann zwischen Middleware und Route abgelaufen sein → 401, nicht 500.
  const { jwt } = await users.createJWT({ userId, ...(sessionId ? { sessionId } : {}), duration: JWT_DURATION_S })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return { jwt }
})
