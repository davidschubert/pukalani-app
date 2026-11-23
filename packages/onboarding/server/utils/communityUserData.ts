import type { H3Event } from 'h3'
import type { CommunityErasureResult, CommunityUserDataExport, RetainedMembership } from '../../../control/shared/communityTeam'
import type { AccountDeletionWarning } from '../../../core/shared/accountDeletion'
import { callControlPlane } from './controlPlane'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * F3 — DSGVO-Beitrag des onboarding-Layers.
 *
 * DER BEFUND: `deleteUserCompletely` räumt das Appwrite-Projekt der RUNTIME ab.
 * Die Mitgliedschaften einer Person (`community_members`) und die Einladungen an
 * ihre Adresse (`community_invites`) liegen aber im CONTROL PLANE — einem
 * anderen Projekt, auf das die Runtime nur einen read-only-Key hat. Vor F3
 * blieben sie deshalb stehen: eine tote `runtimeUserId` in jeder Mitgliedschaft,
 * und — der eigentliche Punkt — die E-Mail-Adresse der gelöschten Person
 * unbefristet in jeder Einladung.
 *
 * WARUM DER CONTRIBUTOR IN DIESEM LAYER LEBT: „ein Layer mit Nutzerdaten muss
 * einen registerUserDataContributor mitbringen" (CLAUDE.md) — und die Naht zum
 * Control Plane gehört diesem Layer (A14, dieselbe Regel wie beim
 * Beitritts-Handler in server/plugins/community-join.ts). Der feedback-Layer
 * macht es seit E10 genauso: kein eigenes Schema, trotzdem ein Contributor,
 * weil die DATEN existieren.
 *
 * Und genau deshalb steht er NICHT im core: eine Silo-App ohne onboarding hat
 * keine Mitgliedschaften — dort ist das Projekt die Grenze, es gibt nichts
 * aufzuräumen. Ohne den Layer fehlt der Contributor, und die Registry ist
 * automatisch korrekt besetzt.
 *
 * EXPORT DEGRADIERT, LÖSCHUNG NICHT (Muster feedbackUserData.ts): eine Auskunft
 * ohne einen Abschnitt ist besser als gar keine; eine stillschweigend
 * übersprungene Löschung wäre dagegen genau der Fehler, den das
 * Voll-Erfolgs-Gate von `deleteUserCompletely` verhindern soll. Ist die Naht
 * nicht erreichbar, scheitert sie laut — der Account bleibt gesperrt stehen und
 * ein Re-Run räumt den Rest ab.
 *
 * DIE DEGRADATION IST SICHTBAR (SEC-026, Nachtrag): der Abschnitt hiess bei
 * einer nicht erreichbaren Naht `{}` — von „keine Mitgliedschaften" nicht zu
 * unterscheiden. Jetzt steht dort `{ unavailable: true }`.
 */

const USER_DATA_PATH = '/api/control/community/members/user-data'
const USER_ERASE_PATH = '/api/control/community/members/user-erase'
const USER_ERASE_PREVIEW_PATH = '/api/control/community/members/user-erase-preview'

/** i18n-Schlüssel der Warnung „einziger Inhaber" (Locale dieses Layers). */
export const SOLE_OWNER_WARNING_KEY = 'onboarding.accountDelete.soleOwner'
const SOLE_OWNER_WARNING_TEXT_KEY = 'onboarding.accountDelete.soleOwnerText'

/**
 * Wer wird hier gelöscht — und unter welcher Adresse?
 *
 * Das Control Plane bekommt die Identität als Paar (Projekt + User), nicht als
 * JWT: zum Zeitpunkt des Aufrufs ist das Konto gesperrt und verschwindet gleich,
 * bei einem Re-Run existiert es womöglich nicht mehr. Die Begründung steht an
 * der Route.
 *
 * Die ADRESSE geht nur mit, wenn sie BESTÄTIGT ist. Eine unbestätigte Adresse
 * gehört nachweislich niemandem — mit ihr Einladungen zu löschen hieße, auf
 * fremde Zeilen zu zeigen, weil jemand sie einmal eingetippt hat. Fehlt die
 * Adresse, bleiben die Einladungen unangetastet; sie verfallen ohnehin nach 7
 * Tagen und tragen ohne Empfänger keinen Zugang mehr.
 */
async function erasureIdentity(event: H3Event, userId: string): Promise<{
  runtimeProjectId: string
  runtimeUserId: string
  email?: string
}> {
  const runtimeProjectId = useRuntimeConfig(event).public.appwriteProjectId
  // 404 = Konto schon weg (Orphan-Cleanup-Modus des Orchestrators) → ohne
  // Adresse weitermachen, die Mitgliedschaften findet das Paar auch so.
  // NUR das 404 (SEC-026, Nachtrag): vorher galt JEDER Fehler als „weg", und
  // ein Wackler liess Einladungen und Early-Access-Anfragen unter dieser
  // Adresse still stehen, während die Löschung Erfolg meldete. Jeder andere
  // Fehler bricht ab; der Re-Run findet das Konto dann wieder.
  const user = await createAdminClient(event).users.get({ userId }).catch((error: unknown) => {
    if (isAppwriteUserMissing(error)) return null
    throw error
  })
  const email = user?.emailVerification && user.email ? user.email : ''

  return { runtimeProjectId, runtimeUserId: userId, ...(email ? { email } : {}) }
}

export async function communityExportUserData(
  event: H3Event,
  userId: string,
): Promise<CommunityUserDataExport | Record<string, never> | { unavailable: true }> {
  // Ohne konfigurierte Naht gibt es hier keine Mitgliedschaften (Silo ohne
  // Control Plane) — das leere Objekt ist dann die wahre Antwort.
  if (!await controlServiceAvailable(event)) return {}
  const identity = await erasureIdentity(event, userId)
  // Naht konfiguriert, aber nicht erreichbar: die Auskunft geht ohne diesen
  // Abschnitt raus, SAGT es aber — `{ unavailable: true }` statt `{}`.
  return await callControlPlane<CommunityUserDataExport>(event, USER_DATA_PATH, identity)
    .catch(softFail('onboarding:utils/communityUserData:callControlPlane', { unavailable: true as const }))
}

export async function communityDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const identity = await erasureIdentity(event, userId)
  const result = await callControlPlane<CommunityErasureResult>(event, USER_ERASE_PATH, identity)

  // „Letzter Owner": die Zeile MUSSTE bleiben (sonst stünde die Community ohne
  // jemanden da, der übertragen oder abrechnen kann) und wurde nur
  // entpersonalisiert. Das darf nicht still passieren — der Betreiber muss
  // wissen, welche Community jetzt einen verwaisten Owner-Platz hat.
  if (result.retained.length > 0) {
    logEvent('warn', 'gdpr.community_owner_retained', {
      userId,
      communities: result.retained.map(entry => `${entry.communityName} (${entry.communityId})`).join(', '),
    })
  }

  // Einladungen, Early-Access-Anfragen und die Testphase des Kontos zählen als
  // gelöschte Zeilen — sie sind es. Gekappte Spuren in FREMDEN Einladungen und geleerte Adressen an
  // Early-Access-Codes zählen als anonymisiert: die Zeile bleibt, nur der
  // Personenbezug fällt weg.
  return {
    deleted: result.deleted + result.invitesDeleted + result.inviteRequestsDeleted + (result.trialClaimsDeleted ?? 0),
    anonymized: result.anonymized + result.invitesAnonymized + result.inviteCodesAnonymized,
  }
}

/**
 * VOR DEM LÖSCHEN SAGEN, WAS OHNE INHABER DASTEHT (2026-11-23): die
 * Communities, in denen dieses Konto der letzte aktive Owner ist. Die
 * Löschung bleibt erlaubt; der Owner-Platz bliebe ohne Personenbezug stehen,
 * und niemand könnte mehr übertragen oder abrechnen. Darum der Hinweis
 * „übertrage vorher den Besitz".
 *
 * Ohne Naht (Silo) gibt es keine Mitgliedschaften ⇒ keine Warnung. Ist die
 * Naht nicht erreichbar, WIRFT die Funktion: der core meldet die Liste dann
 * als unvollständig, statt „nichts betroffen" zu behaupten.
 */
export async function communityDeletionWarnings(event: H3Event, userId: string): Promise<AccountDeletionWarning[]> {
  if (!await controlServiceAvailable(event)) return []
  const runtimeProjectId = useRuntimeConfig(event).public.appwriteProjectId
  const result = await callControlPlane<{ retained: RetainedMembership[] }>(event, USER_ERASE_PREVIEW_PATH, {
    runtimeProjectId,
    runtimeUserId: userId,
  })
  const names = [...new Set(result.retained.map(entry => entry.communityName))]
  return names.length ? [{ key: SOLE_OWNER_WARNING_KEY, textKey: SOLE_OWNER_WARNING_TEXT_KEY, items: names }] : []
}
