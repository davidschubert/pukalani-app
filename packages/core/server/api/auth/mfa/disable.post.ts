import { AuthenticatorType } from 'node-appwrite'
import type { AuthenticationFactor } from 'node-appwrite'
import { createSessionClient } from '../../../lib/appwrite'
import { mfaChallengeSchema } from '../../../../schemas/auth'
import { isInvalidMfaCode, mfaFactorFor } from '../../../../shared/mfa'
import type { MfaDisableResponse } from '../../../../shared/types/auth-responses'

/**
 * Zwei-Faktor abschalten.
 *
 * BIS APPWRITE 2.6 VERLANGTE APPWRITE DAFÜR NICHTS (gemessen 2026-08-13):
 * `updateMFA(false)` und `deleteMFAAuthenticator` gingen mit nichts als einer
 * Session durch — kein Passwort, kein Code. Damit wäre der Schutz nur so stark
 * wie ein unbeaufsichtigter Bildschirm gewesen, und ein gestohlenes
 * Session-Cookie hätte ihn abräumen können. Die Bestätigung ist deshalb
 * UNSERE, und sie ist bewusst ein gültiger ZWEITER FAKTOR statt des Passworts:
 * wer den Zweitfaktor entfernt, soll belegen, dass er ihn noch hat. Der
 * Wiederherstellungs-Code zählt auch — sonst wäre ein verlorenes Telefon eine
 * Sackgasse.
 *
 * SEIT APPWRITE 2.7 (AW27, 2026-11-06) verlangt Appwrite SELBST eine frische
 * MFA-Challenge, bevor `updateMFA(false)` durchgeht — dieselbe Regel, die für
 * das Löschen des Authenticators schon galt. Unsere Reihenfolge (Challenge
 * erst, dann das Flag, dann der Authenticator) erfüllt genau das; die
 * Bestätigung bleibt trotzdem unsere, weil wir den Wiederherstellungs-Code
 * als Faktor zulassen. TOTP-Codes gelten seit 2.7 nur noch EINMAL: der Code
 * wird hier genau einmal verbraucht (in der Challenge), die zwei Aufrufe
 * danach stützen sich auf die Challenge, nicht auf den Code.
 *
 * BEIDES abschalten, nicht nur das Flag: bliebe der verifizierte Authenticator
 * stehen (oder auch nur eine verifizierte E-Mail), rechnet Appwrite bei einem
 * späteren `mfa: true` sofort wieder mit zwei Faktoren.
 */
export default defineEventHandler(async (event): Promise<MfaDisableResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { mode, code } = await readValidatedBody(event, mfaChallengeSchema.parse)
  const { account } = createSessionClient(event)

  // Eine Challenge geht auch aus einer bereits vollwertigen Session heraus —
  // sie fügt den Faktor dann nur erneut hinzu. Genau das macht sie hier zum
  // Code-Prüfer, ohne dass wir irgendetwas selbst nachrechnen müssten.
  try {
    // Cast, weil `recoveryCode` im SDK-Enum GAR NICHT vorkommt — genau das ist
    // der in shared/mfa.ts beschriebene Appwrite-Fehler. Der Typ ist hier die
    // falsche Autorität: er bildet die kaputte Schreibweise ab.
    const challenge = await account.createMFAChallenge({ factor: mfaFactorFor(mode) as AuthenticationFactor })
    await account.updateMFAChallenge({ challengeId: challenge.$id, otp: code })
  }
  catch (error) {
    if (isInvalidMfaCode(error)) {
      await logAuthEvent(event, 'user.mfa_challenge_failed', { userId: event.context.user.$id, method: mode })
      throw createError({ status: 400, statusText: 'Invalid code', data: { code: 'mfa_invalid_code' } })
    }
    throw createError({ status: 400, statusText: 'MFA disable failed' })
  }

  await account.updateMFA({ mfa: false })
  // Best effort: das Flag ist schon aus, die Anmeldung verlangt also keinen
  // zweiten Faktor mehr. Ein hängengebliebener Authenticator wäre unschön,
  // aber kein Grund, dem Nutzer ein „hat nicht geklappt" zu zeigen.
  await account.deleteMFAAuthenticator({ type: AuthenticatorType.Totp }).catch(() => {})

  await logAuthEvent(event, 'user.mfa_disabled', { userId: event.context.user.$id, name: event.context.user.name })
  return { ok: true }
})
