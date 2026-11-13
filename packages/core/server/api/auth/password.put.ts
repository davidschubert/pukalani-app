import { createSessionClient } from '../../lib/appwrite'
import { AppwriteException } from 'node-appwrite'
import { passwordChangeServerSchema } from '../../../schemas/auth'
import { passwordPolicyRejection } from '../../../shared/passwordPolicy'

/**
 * Passwort ändern (eingeloggter User) — läuft als der User selbst (SessionClient).
 * Appwrite prüft das aktuelle Passwort (oldPassword); wir leaken keine Details.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { currentPassword, password } = await readValidatedBody(event, passwordChangeServerSchema.parse)
  const { account } = createSessionClient(event)

  try {
    await account.updatePassword({ password, oldPassword: currentPassword })
  }
  catch (error) {
    // Anmelde-Regeln des Projekts (P29) mit eigenem Grund — alles andere
    // (falsches aktuelles Passwort, …) bleibt die generische 400.
    const rejection = error instanceof AppwriteException ? passwordPolicyRejection(error.type) : null
    if (rejection) {
      throw createError({ status: rejection.status, statusText: 'Password rejected', data: { code: rejection.code } })
    }
    throw createError({ status: 400, statusText: 'Password update failed' })
  }

  // Andere aktive Sessions invalidieren (z.B. ein vermutet kompromittiertes
  // Gerät) — die eigene Session bleibt erhalten. Best effort: ein Fehler hier
  // darf die bereits erfolgte Passwortänderung nicht zurückrollen.
  try {
    const { sessions } = await account.listSessions()
    await Promise.all(
      sessions
        .filter(session => !session.current)
        .map(session => account.deleteSession({ sessionId: session.$id }).catch(() => {})),
    )
  }
  catch {
    // Session-Liste nicht abrufbar — Passwort ist dennoch geändert
  }

  // Security-Signal ins Aktivitätsprotokoll (Admin-Sicht) — best-effort
  await logAuthEvent(event, 'user.password_changed', {
    userId: event.context.user.$id,
    name: event.context.user.name,
    method: 'self',
  })

  return { ok: true }
})
