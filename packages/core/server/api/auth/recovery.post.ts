import { Query } from 'node-appwrite'
import { z } from 'zod'
import { createSessionClient, createAdminClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'
import { unexpectedRecoveryFailure } from '../../../shared/authFailure'
import { resolveTrustedOrigin } from '../../utils/trustedOrigin'

/**
 * Recovery-Mail anfordern. Läuft als GUEST (SessionClient ohne Session) —
 * createRecovery ist ein Account-Endpoint, der API Key hat dafür bewusst
 * keinen Scope. Antwortet IMMER ok (keine Account-Enumeration);
 * die Nitro-Rate-Limit-Middleware drosselt je Anschluss und je Stunde, die
 * Empfänger-Grenze (`recipientMailLimit.ts`) je Adresse.
 */
/**
 * Turnstile-Token nur an dieser Route, nicht im geteilten Formular-Schema
 * (Vorbild: `inviteToken` in signup.post.ts).
 */
const recoveryRequestSchema = recoverySchema.extend({
  turnstileToken: z.string().max(4096).optional(),
})

export default defineEventHandler(async (event) => {
  const { email, turnstileToken } = await readValidatedBody(event, recoveryRequestSchema.parse)

  /**
   * BOT-BEWEIS (Vorfall 2026-10-27) — VOR `createRecovery`, das die Mail
   * auslöst. Die Ablehnung kommt für JEDE Adresse gleich, bevor eine
   * nachgeschlagen wird; die „immer ok"-Regel darunter (keine Enumeration)
   * bleibt damit unberührt. Ohne Schlüssel ein No-Op.
   */
  await requireTurnstile(event, 'recovery', turnstileToken)

  /**
   * GRENZE JE EMPFÄNGER (AB1 e / SR1 c): gezählt wird JEDE Anforderung für
   * diese Adresse, ob es ein Konto gibt oder nicht — über der Grenze geht
   * keine Mail hinaus, und die Antwort ist dieselbe wie sonst.
   */
  if (!(await allowRecipientMail(event, 'auth:recovery', email, AUTH_MAIL_RECIPIENT_LIMIT))) {
    return { ok: true }
  }

  // Der Link landet in einer echten Mail — sein Host darf nicht aus einer
  // ungeprüften Anfrage stammen (SEC-010, `shared/trustedOrigin.ts`).
  const { origin } = await resolveTrustedOrigin(event)
  const { account } = createSessionClient(event)

  try {
    await account.createRecovery({ email, url: `${origin}/reset-password` })
  }
  catch (error) {
    /**
     * ZWEI GRÜNDE, EINE ANTWORT (AB1 d). Unbekannte oder gesperrte Adresse:
     * erwartet, still. Alles andere — Appwrite nicht erreichbar, der Link-Host
     * im Projekt nicht eingetragen, kein Mailversand — ist ein Fehler im
     * BETRIEB und bekommt eine Zeile (Typ und Status, nie die Adresse). Nach
     * außen bleibt beides dieselbe Antwort.
     */
    const failure = unexpectedRecoveryFailure(error)
    if (failure) logEvent('error', 'auth.recovery_failed', failure)
    return { ok: true }
  }

  try {
    // Security-Signal ins Aktivitätsprotokoll — nur intern (admin-only Audit),
    // die Antwort bleibt in JEDEM Pfad identisch (keine Account-Enumeration).
    const { users } = createAdminClient(event)
    const match = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] }).catch(() => null)
    const found = match?.users[0]
    if (found) {
      await logAuthEvent(event, 'user.recovery_requested', { userId: found.$id, name: found.name })
    }
  }
  catch {
    // Das Protokoll ist Beiwerk — die Mail ist verschickt, die Antwort bleibt.
  }

  return { ok: true }
})
