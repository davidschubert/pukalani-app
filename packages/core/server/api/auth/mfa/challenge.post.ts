import type { AuthenticationFactor } from 'node-appwrite'
import { createSessionClient } from '../../../lib/appwrite'
import { mfaChallengeSchema } from '../../../../schemas/auth'
import { isInvalidMfaCode, mfaFactorFor, mfaLoginMethod } from '../../../../shared/mfa'

/**
 * Der zweite Schritt der Anmeldung: die halbe Session (nur `password` — oder
 * nur `email`, wenn der erste Schritt der E-Mail-Code war) löst ihre
 * Challenge ein und wird damit vollwertig.
 *
 * Bewusst OHNE `requireAuth`: `event.context.user` ist hier IMMER leer — die
 * Middleware füllt ihn aus `account.get()`, und genau das wirft ja noch 401.
 * Der Beweis, dass hier jemand Berechtigtes klopft, ist das Session-Cookie
 * selbst: ohne gültige halbe Session lehnt Appwrite schon das ANLEGEN der
 * Challenge ab. Ein Gast bekommt deshalb 401, nicht etwa eine Fehlermeldung
 * über den Code.
 */
export default defineEventHandler(async (event) => {
  const { mode, code } = await readValidatedBody(event, mfaChallengeSchema.parse)
  const { account } = createSessionClient(event)

  let challenge
  try {
    // Cast, weil `recoveryCode` im SDK-Enum GAR NICHT vorkommt — genau das ist
    // der in shared/mfa.ts beschriebene Appwrite-Fehler. Der Typ ist hier die
    // falsche Autorität: er bildet die kaputte Schreibweise ab.
    challenge = await account.createMFAChallenge({ factor: mfaFactorFor(mode) as AuthenticationFactor })
  }
  catch {
    // Kein Cookie, abgelaufene Session, oder gar kein zweiter Faktor fällig.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  try {
    // Die Antwort ist eine Session — aber ihr `secret` ist LEER (gemessen
    // 2026-08-13). Appwrite erweitert die BESTEHENDE Session um den Faktor,
    // es stellt keine neue aus. Wer hier das Cookie neu setzt, überschreibt
    // ein gültiges Geheimnis mit einem leeren String und meldet den Nutzer
    // im Moment des Erfolgs ab. Also: nichts anfassen.
    await account.updateMFAChallenge({ challengeId: challenge.$id, otp: code })
  }
  catch (error) {
    if (isInvalidMfaCode(error)) {
      // Ein falscher Code VERBRAUCHT die Challenge bei Appwrite nicht (sie
      // wird nur bei Erfolg gelöscht) — Bremse ist deshalb allein unsere
      // Drossel in middleware/05.rate-limit.ts, die auf Fehlversuche zählt.
      const user = await account.get().catch(() => null)
      await logAuthEvent(event, 'user.mfa_challenge_failed', { userId: user?.$id ?? '', method: mode })
      throw createError({ status: 401, statusText: 'Invalid code', data: { code: 'mfa_invalid_code' } })
    }
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Jetzt ist die Session vollwertig — erst hier gilt die Anmeldung. WELCHER
  // erste Schritt davor lag (Passwort oder E-Mail-Code), steht in den
  // Faktoren der Session, nicht in dieser Route — also nachsehen statt
  // `password` zu behaupten (bis 2026-10-24 stand hier fest `password+…`).
  const user = await account.get()
  const factors = await account.getSession({ sessionId: 'current' }).then(s => s.factors).catch(() => [])
  await logAuthEvent(event, 'user.login', { userId: user.$id, name: user.name, method: mfaLoginMethod(factors, mode) })
  return { ok: true }
})
