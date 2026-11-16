// Cross-Layer als EXPLIZITER Vertrag (A14): die Testphase gehört dem Control
// Plane (es besitzt trial_claims) — dieser Layer konsumiert die Antwort. Reiner
// Typ-Import, kein Laufzeit-Coupling.
import type { TrialAvailability } from '../../../../control/shared/types/trialClaim'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * „Bekäme meine nächste Community eine Testphase?" (BE-015) — für die
 * Zusammenfassung des Wizards, BEVOR angelegt wird. Die Testphase gibt es
 * einmal je Konto; die Antwort kommt vom Control Plane, das das Konto selbst
 * aus dem JWT liest.
 *
 * Ein GET, das im Control Plane ein POST ist: hier wird nur gelesen, aber das
 * JWT gehört in den Rumpf, nicht in eine Adresse. Wie die Geschwister unter
 * `/api/onboarding/` liegt die Route schon unter
 * `pukalani.tenancy.controlApiPrefixes`, und wie `communities.get.ts` antwortet
 * sie nur auf einem Kontroll-Host (404 sonst) — auf einer Kunden-Community hat
 * die Frage keinen Platz.
 */
export default defineEventHandler(async (event): Promise<TrialAvailability> => {
  if (!event.context.controlCenter) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const jwt = await mintRuntimeJwt(event)
  return await callControlPlane<TrialAvailability>(event, '/api/control/onboarding/trial', { jwt })
})
