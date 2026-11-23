import { z } from 'zod'
import { previewCommunityErasure } from '../../../../utils/communityErasure'

/**
 * VORSCHAU VOR DER DSGVO-LÖSCHUNG (2026-11-23): in welchen Communities ist
 * dieses Runtime-Konto der letzte aktive Owner? Die Karte „Konto löschen"
 * sagt es VOR dem Knopf — die Löschung selbst bleibt erlaubt und lässt den
 * Owner-Platz ohne Personenbezug stehen (`decideMembershipErasure`).
 *
 * Nur lesen. Derselbe Gate wie `user-erase` (Service-Secret, Projekt gegen
 * die EINE bediente Runtime geprüft); die Identität nennt der Aufrufer für
 * SICH (die Runtime nimmt sie aus der Sitzung). Die Antwort nennt nur
 * Communities, in denen dieses Konto selbst Owner ist.
 */
const bodySchema = z.object({
  runtimeProjectId: z.string().min(1).max(36),
  runtimeUserId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const runtimeProjectId = assertOnboardingRuntimeProject(event, body.runtimeProjectId)

  const retained = await previewCommunityErasure(event, runtimeProjectId, body.runtimeUserId)
  return { retained }
})
