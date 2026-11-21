import { Query } from 'node-appwrite'
import { z } from 'zod'
import { communityRoleHasCapability, isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { parseSiteProfile, serializeSiteProfile } from '../../../../shared/onboarding'
import { communityProfileSchema, type CommunityProfileResult } from '../../../../schemas/communityProfile'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'
import { softFail } from '../../../../../core/server/utils/softFail'

/**
 * Self-Service: NAME UND BESCHREIBUNG einer Community ändern (U5, Befund K1).
 *
 * Der Name wurde bisher genau einmal gesetzt — im Wizard — und war danach für
 * niemanden mehr änderbar, auch nicht für den Betreiber. Er trägt aber den
 * Menükopf, den Browser-Titel, das Vorschaubild und den Absender jeder Mail;
 * ein Tippfehler beim Anlegen war damit dauerhaft.
 *
 * Aufbau, Prüfungen und Begründung sind IDENTISCH zu den Nachbarn
 * `registration.post.ts` und `branding.post.ts` — dieselbe Naht, kein zweiter
 * Kanal: Service-Secret (unser Deployment) + JWT (WER, vom Control Plane
 * selbst geprüft) + Site-Rolle (`team.manage` auf GENAU DIESER Community).
 * Eine mitgeschickte fremde `communityId` ist deshalb harmlos.
 *
 * ── DIE ADRESSE BLEIBT UNBERÜHRT ────────────────────────────────────────
 * Geschrieben werden AUSSCHLIESSLICH `name` und die Beschreibung im
 * `profile`-JSON. `host`, `customDomain` und alles andere fasst diese Route
 * nicht an — der Host ist eine eigene Entscheidung mit eigenen Folgen (TLS,
 * Links, Weiterleitungen) und hat seinen eigenen Reiter.
 *
 * ── WARUM DAS PROFIL GELESEN UND NEU GESCHRIEBEN WIRD ───────────────────
 * `communities.profile` ist EIN JSON-Feld mit fünf Antworten aus dem Wizard.
 * Ein blindes Überschreiben mit `{description}` verlöre Zweck, Größe,
 * Kategorie und Ziel — Angaben, die anderswo ausgewertet werden. Also:
 * parsen, das eine Feld setzen, serialisieren. Gelesen wird die Zeile, die
 * ohnehin schon für die Projekt-Prüfung geholt wird — keine zweite Abfrage.
 */
const bodySchema = communityProfileSchema.extend({
  jwt: z.string().min(1).max(4096),
  /** = communities.$id. Wird NICHT geglaubt, sondern gegen die Mitgliedschaft geprüft. */
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<CommunityProfileResult> => {
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
    logEvent('warn', 'site.profile_denied', {
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
  }).catch(softFail('control:api/control/community/profile.post:getRow', null))
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  // Die vier anderen Wizard-Antworten bleiben stehen; '' löscht die
  // Beschreibung (parseSiteProfile lässt leere Strings ohnehin weg).
  const profile = parseSiteProfile(tenant.profile)
  const description = body.description ?? ''
  // Hauptsprache (Q10): nur ein mitgeschicktes Feld ändert sie.
  const nextProfile = serializeSiteProfile({ ...profile, description, ...(body.locale ? { locale: body.locale } : {}) })

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
    data: { name: body.name, profile: nextProfile },
  }).catch((error) => { throw toH3Error(error, 'Could not update site') })

  logEvent('info', 'site.profile_changed', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    // Der NAME steht im Log (er ist öffentlich sichtbar und der Grund des
    // Aufrufs), die Beschreibung nur als Länge — ein Freitext gehört nicht
    // in jede Log-Zeile.
    name: row.name,
    descriptionLength: description.length,
  })

  return {
    communityId: row.$id,
    name: row.name ?? '',
    description: parseSiteProfile(row.profile).description ?? '',
    locale: parseSiteProfile(row.profile).locale ?? '',
  }
})
