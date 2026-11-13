import { AuthenticatorType } from 'node-appwrite'
import { createSessionClient } from '../../../lib/appwrite'
import { mfaVerifySchema } from '../../../../schemas/auth'
import { isInvalidMfaCode } from '../../../../shared/mfa'
import type { MfaVerifyResponse } from '../../../../shared/types/auth-responses'

/**
 * Einrichtung Schritt 2: den frischen Authenticator mit dem ersten Code
 * bestätigen, MFA scharfschalten und die Wiederherstellungs-Codes EINMALIG
 * herausgeben.
 *
 * Die Reihenfolge ist keine Geschmacksfrage. `updateMFA(true)` nimmt Appwrite
 * auch dann an, wenn GAR KEIN Faktor verifiziert ist (gemessen 2026-08-13) —
 * es passiert dann bloß nichts, denn `minimumFactors` bleibt bei 1. Das Konto
 * sähe für uns geschützt aus und wäre es nicht. Also erst bestätigen, dann
 * scharfschalten.
 */
export default defineEventHandler(async (event): Promise<MfaVerifyResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { code } = await readValidatedBody(event, mfaVerifySchema.parse)
  // Fehlversuche je KONTO, über alle IPs (SEC-003).
  await limitAccountAttempts(event, 'mfa', event.context.user.$id)
  const { account } = createSessionClient(event)

  try {
    await account.updateMFAAuthenticator({ type: AuthenticatorType.Totp, otp: code })
  }
  catch (error) {
    if (isInvalidMfaCode(error)) {
      throw createError({ status: 400, statusText: 'Invalid code', data: { code: 'mfa_invalid_code' } })
    }
    if ((error as { type?: string } | null)?.type === 'user_authenticator_already_verified') {
      throw createError({ status: 409, statusText: 'Already enabled', data: { code: 'mfa_already_enabled' } })
    }
    throw createError({ status: 400, statusText: 'MFA verification failed' })
  }

  await account.updateMFA({ mfa: true })

  // Wiederherstellungs-Codes gibt es genau EINMAL: `createMFARecoveryCodes`
  // antwortet beim zweiten Mal mit 409 `user_recovery_codes_already_exists`,
  // und zwar dauerhaft — sie überleben sogar ein Abschalten von MFA. Wer also
  // ein zweites Mal einrichtet, braucht `updateMFARecoveryCodes` (neu würfeln,
  // alte werden ungültig). Beide Wege liefern dieselbe Form, deshalb der
  // Rückfall statt einer Vorab-Abfrage.
  let recoveryCodes: string[]
  try {
    recoveryCodes = (await account.createMFARecoveryCodes()).recoveryCodes
  }
  catch (error) {
    if ((error as { type?: string } | null)?.type === 'user_recovery_codes_already_exists') {
      recoveryCodes = (await account.updateMFARecoveryCodes()).recoveryCodes
    }
    else {
      throw createError({ status: 400, statusText: 'Recovery codes failed' })
    }
  }

  await logAuthEvent(event, 'user.mfa_enabled', { userId: event.context.user.$id, name: event.context.user.name })

  // Diese Antwort ist die EINZIGE Gelegenheit, die Codes zu sehen — es gibt
  // absichtlich keine Route, die sie später nochmal zeigt.
  return { ok: true, recoveryCodes }
})
