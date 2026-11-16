import { z } from 'zod'
import type { TrialAvailability } from '../../../../shared/types/trialClaim'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'
import { readTrialClaim } from '../../../utils/trialClaims'

/**
 * Vorab-Prüfung für den Wizard (BE-015): bekäme eine neue Community DIESES
 * Kontos jetzt eine Testphase? Damit sagt die Zusammenfassung die Wahrheit,
 * BEVOR jemand auf „Anlegen" drückt.
 *
 * Zwei Beweise wie beim Anlegen (Service-Secret + JWT, das das Control Plane
 * selbst prüft): die Antwort ist eine Aussage über ein Konto, also darf sie
 * nur das Konto selbst bekommen.
 *
 * NUR LESEN, NICHTS ZUSAGEN: vergeben wird ausschließlich in
 * `provisionCommunity` (feste Zeile, 409 = gab es schon). Fehlt die Tabelle
 * noch (Migration control-039 ausstehend), gilt das alte Verhalten — die
 * Anlage vergibt dann, also `true`. Ein anderer Lesefehler wirft; der Wizard
 * zeigt dann einen neutralen Satz.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
}).strict()

export default defineEventHandler(async (event): Promise<TrialAvailability> => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const claim = await readTrialClaim(event, identity)
    .catch((error: unknown) => { throw toH3Error(error, 'Trial check unavailable') })
  return { trialAvailable: claim === null }
})
