import { Query } from 'node-appwrite'
import { z } from 'zod'
import { createSessionClient, createAdminClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'

/**
 * Recovery-Mail anfordern. Läuft als GUEST (SessionClient ohne Session) —
 * createRecovery ist ein Account-Endpoint, der API Key hat dafür bewusst
 * keinen Scope. Antwortet IMMER ok (keine Account-Enumeration);
 * die Nitro-Rate-Limit-Middleware drosselt zusätzlich.
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

  const origin = getRequestURL(event).origin
  const { account } = createSessionClient(event)

  try {
    await account.createRecovery({ email, url: `${origin}/reset-password` })
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
    // Unbekannte E-Mail etc. — nicht leaken, Antwort bleibt identisch
  }

  return { ok: true }
})
