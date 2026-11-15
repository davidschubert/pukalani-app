import { z } from 'zod'
import { exportFeedbackUserData } from '../../../utils/customerFeedback'

/**
 * DSGVO-AUSKUNFT über die Naht: die Runtime-App orchestriert den Export ihres
 * Nutzers, seine Feedback-Zeilen liegen aber hier.
 *
 * KEIN JWT: der Export läuft auch dann, wenn ein Betreiber ihn für ein Konto
 * anstößt, das sich nicht mehr anmelden kann — ein JWT zu verlangen hieße, die
 * Auskunft genau in dem Fall zu verweigern, in dem sie am häufigsten verlangt
 * wird. Der Gate ist das Service-Secret; gescopt wird hart auf das Paar
 * (projectId, userId), das der Aufrufer für SICH selbst nennt.
 *
 * DAS PROJEKT WIRD GEPRÜFT, NICHT GEGLAUBT (SEC-027, 2026-11-15 — dieselbe
 * Regel wie F33 an `community/members/user-data`): `assertOnboardingRuntimeProject`
 * hält das genannte Projekt gegen das EINE, das diese Naht bedient. Eine
 * Auskunft über Feedback-Texte, Namen und Adressen der Nutzer eines FREMDEN
 * Runtime-Projekts wäre auch ohne Schreibrecht ein Datenleck. Weiter benutzt
 * wird der GEPRÜFTE Wert. Die Betreiber-App (apps/control) läuft nicht über
 * diese Route, sondern in-process (server/plugins/feedback-backend.ts).
 */
const bodySchema = z.object({
  projectId: z.string().min(1).max(36),
  userId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const projectId = assertOnboardingRuntimeProject(event, body.projectId)
  return await exportFeedbackUserData(event, projectId, body.userId)
})
