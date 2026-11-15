import { Query } from 'node-appwrite'
import { z } from 'zod'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../../utils/onboardingService'

/**
 * „Bin ich in DIESE Community eingeladen?" — die Antwort für die /join-Seite,
 * wenn kein Token im Link steckt (Glocken-Meldung, zweiter Besuch, Mail auf dem
 * anderen Gerät). Genau das macht Davids Entscheidung 2 wahr: wer schon ein
 * Konto hat, ist nach dem Anmelden EINEN Klick entfernt.
 *
 * KEIN `team.manage` — hier fragt die eingeladene Person nach sich selbst. Die
 * Grenze ist die BESTÄTIGTE E-Mail-Adresse aus dem JWT: gefunden werden nur
 * offene Einladungen an DIESE Adresse und NUR für die mitgegebene Site (der Host,
 * auf dem die Seite läuft). Damit ist die Route kein Verzeichnis fremder
 * Einladungen und kein Konto-Orakel.
 *
 * Zurück geht weder Token noch Hash — die Annahme läuft über die inviteId, und
 * die prüft dieselbe Adressgleichheit noch einmal.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  /**
   * NUR MIT BESTÄTIGTER ADRESSE (SEC-028, 2026-11-15) — dieselbe Bedingung wie
   * beim Annehmen (`members/accept.post.ts`, `identity.emailVerified`). Eine
   * Adresse im Pool-Konto ist erst eine BEHAUPTUNG, bis das Postfach sie
   * bestätigt hat; wer sie nur behauptet, sieht auch keine Einladungen an sie.
   *
   * Die Antwort ist dieselbe wie „keine Einladungen" — kein eigener Fehler,
   * kein Hinweis. Den Schritt „bestätige deine Adresse" kennt die Person aus
   * ihrem eigenen Konto (Banner, /join), dafür braucht es diese Route nicht.
   * Der Link aus der Einladungs-Mail (Token) hängt nicht an dieser Liste.
   */
  if (!identity.emailVerified) return { invites: [], siteName: tenant.name }

  const email = (identity.email ?? '').trim().toLowerCase()
  if (!email) return { invites: [], siteName: tenant.name }

  const { rows } = await admin.tablesDB.listRows<CommunityInviteRow>({
    databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    queries: [
      Query.equal('communityId', body.communityId),
      Query.equal('email', email),
      Query.equal('status', 'pending'),
      Query.orderDesc('$createdAt'),
      Query.limit(5),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read invitations') })

  const now = Date.now()
  const invites = rows
    .filter(row => Date.parse(row.expiresAt) > now)
    .map(row => ({ id: row.$id, role: row.role, expiresAt: row.expiresAt }))

  return { invites, siteName: tenant.name }
})
