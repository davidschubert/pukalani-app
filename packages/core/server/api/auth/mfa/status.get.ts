import { createSessionClient } from '../../../lib/appwrite'
import type { MfaStatusResponse } from '../../../../shared/types/auth-responses'
import { softFail } from '../../../utils/softFail'

/**
 * Zeigt die Sicherheits-Karte, ob der Zweitfaktor an ist.
 *
 * Gefragt wird `listMFAFactors()` und NICHT nur `user.mfa`: das Flag allein
 * sagt nichts: Appwrite nimmt `mfa: true` auch ohne verifizierten Faktor an
 * und verlangt dann trotzdem keinen zweiten (gemessen 2026-08-13). „An" heißt
 * hier deshalb: Flag gesetzt UND ein TOTP-Authenticator verifiziert.
 */
export default defineEventHandler(async (event): Promise<MfaStatusResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { account } = createSessionClient(event)
  const factors = await account.listMFAFactors().catch(softFail('core:api/auth/mfa/status.get:listMFAFactors', null, { quiet: [401] }))

  return {
    // `mfa` steht auf dem User-Modell von account.get() (Middleware 02.auth).
    enabled: user.mfa === true && factors?.totp === true,
    totpVerified: factors?.totp === true,
    // Ob es noch ungenutzte Wiederherstellungs-Codes gibt. Die Codes SELBST
    // gibt diese Route bewusst nicht heraus — sie werden genau einmal gezeigt.
    hasRecoveryCodes: factors?.recoveryCode === true,
  }
})
