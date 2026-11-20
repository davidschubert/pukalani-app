import type { H3Event } from 'h3'
import { FEEDBACK_SERVICE_PATHS } from '../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackServiceReachable } from './feedbackGateway'
import { softFailWith } from '../../../core/server/utils/softFail'

/**
 * DSGVO-Beitrag des feedback-Layers.
 *
 * Der Layer besitzt seit E10 KEINE eigene Tabelle mehr — die Zeilen liegen im
 * Control Plane. Der Contributor bleibt trotzdem hier, und zwar zwingend:
 * „ein Layer mit Nutzerdaten muss einen registerUserDataContributor
 * mitbringen" (CLAUDE.md; im Plan als Folge von Entscheidung 4 ausdrücklich
 * benannt). Er reicht Auskunft und Löschung über dieselbe Naht weiter, über
 * die auch alles andere läuft.
 *
 * GESCOPT wird auf das Paar (eigenes Appwrite-Projekt, userId): dieselbe
 * User-Id in zwei Projekten sind zwei verschiedene Menschen, und diese App
 * darf nur ihre eigenen Leute anfassen.
 *
 * EXPORT degradiert (fehlt control, fehlt der Abschnitt — eine Auskunft ohne
 * einen Teil ist besser als gar keine), ABER SICHTBAR (SEC-026, 2026-11-15):
 * statt `{}` steht dann `{ unavailable: true }` im Abschnitt. Ein leeres
 * Objekt sah aus wie „diese Person hat kein Feedback" — eine Auskunft darf
 * nicht vollständig aussehen, wenn sie es nicht ist. LÖSCHUNG NICHT: `deleteUserCompletely`
 * gated `users.delete` auf Voll-Erfolg, und eine stillschweigend
 * übersprungene Löschung wäre genau der Fehler, den dieses Gate verhindern
 * soll. Ist die Naht nicht erreichbar, scheitert sie laut.
 */

function runtimeProjectId(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteProjectId
}

/** Der Abschnitt, wenn das Control Plane nicht geantwortet hat. */
const FEEDBACK_EXPORT_UNAVAILABLE = { unavailable: true } as const

export async function feedbackExportUserData(event: H3Event, userId: string): Promise<Record<string, unknown>> {
  if (!await feedbackServiceReachable(event)) return { ...FEEDBACK_EXPORT_UNAVAILABLE }
  return await callFeedbackService<Record<string, unknown>>(event, FEEDBACK_SERVICE_PATHS.userData, {
    projectId: runtimeProjectId(event),
    userId,
  }).catch(softFailWith('feedback:utils/feedbackUserData:callFeedbackService', () => ({ ...FEEDBACK_EXPORT_UNAVAILABLE })))
}

export async function feedbackDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  return await callFeedbackService<UserDataDeleteResult>(event, FEEDBACK_SERVICE_PATHS.userErase, {
    projectId: runtimeProjectId(event),
    userId,
  })
}
