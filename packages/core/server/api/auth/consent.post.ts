import { createConsentPromptSchema } from '../../../schemas/auth'
import { appRequiredConsents, missingConsents, writeConsentRecord } from '../../utils/consentRecords'
import type { ConsentStateResponse } from '../../../shared/types/consent'

/**
 * DIE NACHFRAGE BEANTWORTEN (SEC-007): das eingeloggte Konto bestätigt die
 * Zustimmungen, die ihm fehlen. Geschrieben wird je Art eine Zeile mit
 * `way: 'prompt'` — nur für Arten, die die App verlangt, die fehlen UND die
 * im Body ausdrücklich `true` sind. Jede FEHLENDE Art ist im Body Pflicht
 * (`z.literal(true)`), sonst 400.
 *
 * Steht auf der Erlaubnisliste der Tür (`/api/auth/`) — sonst könnte niemand
 * die Tür öffnen. Gedrosselt in `05.rate-limit.ts` (`auth:consent`).
 *
 * Fehler beim Schreiben werden NICHT geschluckt: die Nachfrage soll sagen,
 * dass es nicht geklappt hat, statt sich zu schließen.
 */
export default defineEventHandler(async (event): Promise<ConsentStateResponse> => {
  const userId = event.context.user?.$id
  if (!userId) throw createError({ status: 401, statusText: 'Unauthorized' })

  const required = appRequiredConsents()
  const appConfig = useAppConfig() as { pukalani?: { auth?: { termsUrl?: string } } }
  const termsUrl = appConfig.pukalani?.auth?.termsUrl ?? ''
  if (!required.length) return { required, missing: [], termsUrl }

  const before = await missingConsents(event, userId)
  const body = await readValidatedBody(event, createConsentPromptSchema(undefined, {
    requireTerms: before.includes('terms'),
    requireBusiness: before.includes('business'),
  }).parse)

  for (const consent of required) {
    if (!before.includes(consent.kind) || body[consent.kind] !== true) continue
    await writeConsentRecord(event, { userId, kind: consent.kind, version: consent.version, way: 'prompt' })
  }

  return { required, missing: await missingConsents(event, userId), termsUrl }
})
