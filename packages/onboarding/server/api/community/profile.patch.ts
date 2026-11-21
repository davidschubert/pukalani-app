import { communityProfileSchema, type CommunityProfileResult } from '../../../../control/schemas/communityProfile'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * NAME UND BESCHREIBUNG DIESER COMMUNITY ändern (U5, Dashboard-Befund K1).
 * Aufrufer ist die Karte ganz oben auf `/dashboard/community`.
 *
 * WARUM DIESE ROUTE IM ONBOARDING-LAYER LIEGT: dieselbe Begründung wie beim
 * Registrierungs-Schalter nebenan — `communities` gehört dem Control Plane,
 * die Platform-App hat dorthin nur einen READ-ONLY-Key, und der einzige
 * vorgesehene Schreibkanal ist die Service-Naht DIESES Layers
 * (utils/controlPlane.ts: Secret + JWT). Kein zweiter Kanal, kein erweiterter
 * Lese-Key.
 *
 * AUTORISIERUNG: `requireCommunityPermission(event, 'team.manage')` — dieselbe
 * Capability, die der Reiter „Allgemein" ohnehin verlangt, und NIE
 * `requirePermission` (die ist synchron und für Betreiber-Routen). Das Control
 * Plane prüft die Rolle danach noch einmal selbst; diese Prüfung ist die
 * schnelle, die 403 gibt, bevor ein JWT geprägt wird.
 *
 * DIE ADRESSE BLEIBT UNBERÜHRT: Host und eigene Domain haben ihren eigenen
 * Reiter und ihre eigenen Routen. Hier geht es nur um den Anzeigenamen und die
 * Beschreibung — die Karte sagt das dem Menschen auch.
 */
export default defineEventHandler(async (event): Promise<CommunityProfileResult> => {
  await requireCommunityPermission(event, 'team.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, die man umbenennen könnte
  // (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine fehlende Route.
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, communityProfileSchema.parse)
  const jwt = await mintRuntimeJwt(event)

  // communityId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem
  // Body — sonst benennte ein durchgereichter Wert eine fremde Community um.
  return await callControlPlane<CommunityProfileResult>(
    event,
    '/api/control/community/profile',
    {
      jwt,
      communityId: tenant.communityId,
      name: body.name,
      description: body.description ?? '',
      // Nur mitschicken, wenn gesetzt: eine ältere control-Fassung kennt das
      // Feld nicht und lehnte den ganzen Aufruf ab (Schema ist strikt).
      ...(body.locale ? { locale: body.locale } : {}),
      // KI-Training (KC1): ebenso nur, wenn gesetzt.
      ...(body.aiTraining !== undefined ? { aiTraining: body.aiTraining } : {}),
    },
  )
})
