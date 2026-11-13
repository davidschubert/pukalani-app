import { createAdminClient, createSessionClient } from '../../lib/appwrite'
import { resetServerSchema } from '../../../schemas/auth'

/** Passwort mit userId+secret aus der Recovery-Mail setzen (Guest-Endpoint). */
export default defineEventHandler(async (event) => {
  const { userId, secret, password } = await readValidatedBody(event, resetServerSchema.parse)

  const { account } = createSessionClient(event)

  try {
    await account.updateRecovery({ userId, secret, password })
    await logAuthEvent(event, 'user.password_changed', { userId, method: 'recovery' })
  }
  catch {
    // Abgelaufenes/falsches Secret — generisch antworten
    throw createError({ status: 400, statusText: 'Invalid or expired recovery link' })
  }

  /**
   * DIE PAUSE DES KONTOS AUFHEBEN (SEC-003): wer sein Passwort gerade über
   * das Postfach neu gesetzt hat, soll sich sofort anmelden können — der Weg
   * „Passwort zurücksetzen" ist der Ausweg aus der Konto-Bremse beim Login
   * (accountAttempts.ts). Die Recovery-Routen selbst zählen bewusst NICHT je
   * Konto. Ein Fehler hier darf den gelungenen Reset nicht scheitern lassen.
   */
  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    await clearAccountAttempts(event, 'login', user.email)
  }
  catch {
    // Best effort: schlimmstenfalls läuft die Pause ihr Fenster zu Ende.
  }

  return { ok: true }
})
