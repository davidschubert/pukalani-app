import { z } from 'zod'
import { eraseFeedbackUserData } from '../../../utils/customerFeedback'

/**
 * DSGVO-LÖSCHUNG über die Naht. „Löschen" heißt hier anonymisieren, wo fremder
 * Kontext dranhängt (Einträge mit Stimmen und Diskussion), und wirklich
 * löschen, wo keiner dranhängt (die Stimmen der Person selbst) — die
 * Begründung steht bei eraseFeedbackUserData.
 *
 * DAS PROJEKT WIRD GEPRÜFT, NICHT GEGLAUBT (SEC-027, 2026-11-15 — dieselbe
 * Regel wie F33 an `community/members/user-erase`): `assertOnboardingRuntimeProject`
 * hält das genannte Projekt gegen das EINE, das diese Naht bedient. Vorher
 * reichte das Service-Secret, um Feedback-Zeilen und Stimmen der Nutzer eines
 * FREMDEN Runtime-Projekts zu anonymisieren bzw. zu löschen. Weiter benutzt
 * wird der GEPRÜFTE Wert, nicht der aus dem Body. Die Betreiber-App selbst
 * (apps/control) läuft nicht über diese Route, sondern in-process
 * (server/plugins/feedback-backend.ts) — die Prüfung trifft nur Aufrufer über
 * die Naht, und die einzige solche App ist heute die Pool-App `platform`.
 *
 * Protokolliert, weil das eine schreibende Fremd-Operation ist: wer sie
 * auslöst, ist per Secret unser eigenes Deployment, aber WELCHES Konto es
 * getroffen hat, gehört ins Log.
 */
const bodySchema = z.object({
  projectId: z.string().min(1).max(36),
  userId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const projectId = assertOnboardingRuntimeProject(event, body.projectId)
  const result = await eraseFeedbackUserData(event, projectId, body.userId)
  logEvent('info', 'feedback.user_erased', { projectId, userId: body.userId, ...result })
  return result
})
