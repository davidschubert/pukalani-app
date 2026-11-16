import { z } from 'zod'
import { customDomainStateFor } from '../../../../utils/customDomainService'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * Den Stand der eigenen Domain LESEN (control-035).
 *
 * POST, obwohl es ein Lesevorgang ist — wie alle Routen dieser Naht: das JWT
 * des Nutzers reist im RUMPF, nicht in der URL. Ein Token im Query-String
 * landet in nginx-Logs, in Verlaufslisten und in Referrern.
 *
 * OHNE BERECHTIGUNGS-PRÜFUNG (`requireEntitlement: false`), und das ist Absicht:
 * ein Owner ohne Berechtigung soll die Seite sehen und erfahren, was ihm fehlt. Der Zustand,
 * den er dort liest, ist ohnehin „keine Domain" — es gibt nichts zu leaken.
 * `entitlement` in der Antwort (seit control-040; `planAllows` für ältere
 * Seiten) sagt der Seite, ob sie die Eingabe anbietet und warum nicht.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row } = await requireCommunityDomainOwner(event, body, { requireEntitlement: false })
  return customDomainStateFor(event, row)
})
