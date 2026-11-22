import { Account, Client } from 'node-appwrite'
import { z } from 'zod'
import { deriveHandoffKey, handoffAudience, openHandoff } from '../../utils/embedHandoff'
import { setSessionCookie } from '../../lib/appwrite'
import { claimHandoffOnce, earliestExpire, handoffAuthAt, handoffMatchesSession } from '../../utils/sessionHandoff'
import { softFail } from '../../utils/softFail'

const bodySchema = z.object({ token: z.string().min(1).max(2048) }).strict()

/**
 * E2 Embed-Login, Schritt 2 (läuft im IFRAME, cross-site eingebettet — es hat
 * KEIN first-party Cookie): tauscht das Handoff-Token des Popups gegen das
 * Session-Cookie im CHIPS-Modus (SameSite=None; Secure; Partitioned). Das
 * Secret wird VOR dem Setzen gegen Appwrite validiert (getSession liefert
 * auch das echte Ablaufdatum) — ein manipuliertes/abgelaufenes Token setzt
 * nie ein Cookie. Gate pukalani.auth.embedSession; Rate-Limit: FAILURE_LIMITED
 * (Token-Raten drosseln, erfolgreiche Handoffs kosten kein Budget).
 *
 * KARTE (PK1 E1b): Popup und iframe liegen auf DEMSELBEN Host und damit in
 * derselben Community — die Karte bindet an genau diesen Ort, eine eigene
 * Sitzung brächte hier nur „Abmelden je Browser-Kontext" und scheiterte bei
 * Zwei-Faktor-Konten. Darum: dieselbe Sitzung, als Kopie markiert (sie wird
 * nie von einem späteren Host-Wechsel gelöscht).
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { auth?: { embedSession?: boolean } } }
  if (appConfig.pukalani?.auth?.embedSession !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  // Zielgruppe = der EIGENE Host: das Popup, das gesiegelt hat, ist unsere
  // Login-Seite auf genau dieser Origin (s. embed-handoff.post.ts).
  const grant = openHandoff(body.token, deriveHandoffKey(config.appwriteKey), handoffAudience(getHeader(event, 'host')))
  // Ein Siegel mit Kennung (Modus `write`) gilt nur EINMAL — ein zweites
  // Einlösen sieht aus wie ein abgelaufenes Siegel.
  if (!grant || (grant.nonce !== undefined && !claimHandoffOnce(grant.nonce))) {
    throw createError({ status: 401, statusText: 'Invalid or expired handoff token' })
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)
    .setSession(grant.secret)
  const session = await new Account(client).getSession({ sessionId: 'current' }).catch(softFail('core:api/auth/embed-session.post:getSession', null, { quiet: [401] }))
  if (!session || !handoffMatchesSession(grant, session)) {
    throw createError({ status: 401, statusText: 'Session no longer valid' })
  }

  // Nicht länger als die Karte der Quelle (Review B1).
  setSessionCookie(event, grant.secret, earliestExpire(session.expire, grant.expiresAt), {
    partitioned: true,
    card: { sessionId: session.$id, userId: session.userId, authAt: handoffAuthAt(grant, session), own: false },
  })
  return { ok: true }
})
