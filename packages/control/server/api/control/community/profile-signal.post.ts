import { Query } from 'node-appwrite'
import { z } from 'zod'
import { communityRoleHasCapability, isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { parseSiteProfile, serializeSiteProfile } from '../../../../shared/onboarding'
import { communityProfileSignalSchema, type CommunityProfileSignalResult } from '../../../../schemas/profileSignal'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'
import { softFail } from '../../../../../core/server/utils/softFail'

/**
 * DAS MARKT-SIGNAL EINER COMMUNITY SPEICHERN (U19) — Größe, Zweck, Ziel.
 *
 * Aufbau, Prüfungen und Begründung sind IDENTISCH zum Nachbarn
 * `profile.post.ts`: dieselbe Naht, kein zweiter Kanal — Service-Secret
 * (unser Deployment) + JWT (WER, vom Control Plane selbst geprüft) + Site-Rolle
 * (`team.manage` auf GENAU DIESER Community). Eine mitgeschickte fremde
 * `communityId` ist deshalb harmlos.
 *
 * ── WARUM KEINE NEUE TABELLE UND KEINE MIGRATION ────────────────────────────
 * Die drei Antworten haben in `communities.profile` ihren angestammten Platz:
 * `SiteProfile` trägt `purpose`/`memberRange`/`goal` seit dem ersten Wizard als
 * optionale Felder, `parseSiteProfile` liest sie, und die Communities aus der
 * Zeit vor U12 haben dort echte Werte stehen. Eine eigene Tabelle hätte
 * denselben Wert an einem zweiten Ort geführt und die Auswertung gezwungen,
 * Alt- und Neubestand zu vereinigen — für null zusätzliche Aussagekraft.
 *
 * ── WARUM DAS PROFIL GELESEN UND NEU GESCHRIEBEN WIRD ───────────────────────
 * `communities.profile` ist EIN JSON-Feld. Ein blindes Überschreiben verlöre
 * `category` (eine der drei Wizard-Pflichtantworten) und `description` (der
 * Text, den `/dashboard/community` bearbeitet). Also: parsen, die gegebenen
 * Felder setzen, serialisieren. Gelesen wird die Zeile, die ohnehin schon für
 * die Projekt-Prüfung geholt wird — keine zweite Abfrage.
 *
 * ── TEILANTWORTEN ÜBERSCHREIBEN NICHTS ──────────────────────────────────────
 * Ein weggelassenes Feld heisst „nicht beantwortet", NIE „auf leer setzen" —
 * dieselbe Regel wie bei `neutral` im Branding-PATCH. Das ist hier kein
 * Deployment-Argument, sondern ein fachliches: die Karte fragt einmal, und wenn
 * jemand später über einen zweiten Weg eine einzelne Antwort nachreicht, darf
 * das die anderen zwei nicht löschen.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** = communities.$id. Wird NICHT geglaubt, sondern gegen die Mitgliedschaft geprüft. */
  communityId: z.string().min(1).max(36),
  signal: communityProfileSignalSchema,
}).strict()

export default defineEventHandler(async (event): Promise<CommunityProfileSignalResult> => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  // Rolle DIESES Runtime-Users auf DIESER Community. Fail-closed.
  const { rows: memberships } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('communityId', body.communityId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.equal('status', 'active'),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const role = memberships[0]?.role
  if (!role || !isCommunityRole(role) || !communityRoleHasCapability(role, 'team.manage')) {
    logEvent('warn', 'site.profile_signal_denied', {
      communityId: body.communityId,
      runtimeUserId: identity.userId,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  // Gehört die Community überhaupt zu dem Projekt, gegen das wir das JWT
  // geprüft haben? 404 statt 403 — eine fremde Id soll sich nicht bestätigen.
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(softFail('control:api/control/community/profile-signal.post:getRow', null))
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const profile = parseSiteProfile(tenant.profile)
  const nextProfile = serializeSiteProfile({
    ...profile,
    ...(body.signal.purpose ? { purpose: body.signal.purpose } : {}),
    ...(body.signal.memberRange ? { memberRange: body.signal.memberRange } : {}),
    ...(body.signal.goal ? { goal: body.signal.goal } : {}),
  })

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
    data: { profile: nextProfile },
  }).catch((error) => { throw toH3Error(error, 'Could not update site') })

  const saved = parseSiteProfile(row.profile)

  // Das Signal steht VOLLSTÄNDIG im Log: es sind drei Katalog-Ids, kein
  // Freitext und keine personenbezogene Angabe — und die Auswertungs-Seite ist
  // ohnehin dafür gebaut, sie zu zeigen.
  logEvent('info', 'site.profile_signal_given', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    purpose: saved.purpose ?? '',
    memberRange: saved.memberRange ?? '',
    goal: saved.goal ?? '',
  })

  return {
    communityId: row.$id,
    purpose: saved.purpose ?? '',
    memberRange: saved.memberRange ?? '',
    goal: saved.goal ?? '',
  }
})
