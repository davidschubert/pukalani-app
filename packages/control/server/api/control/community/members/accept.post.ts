import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../../utils/onboardingService'
import { hashInviteToken } from '../../../../utils/communityTeam'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Einladung annehmen — der EINE Klick aus Davids Entscheidung 2.
 *
 * Bewusst OHNE `team.manage`: hier handelt die eingeladene Person, nicht der
 * Betreiber. Die drei Beweise sind trotzdem vollständig:
 *  1. Service-Secret (der Aufrufer ist unser Deployment),
 *  2. JWT (WER annimmt — vom Control Plane selbst geprüft),
 *  3. Token-Hash + E-Mail-Gleichheit (ein weitergeleiteter Link bindet nicht den
 *     falschen Account).
 *
 * `communityId` kommt aus der EINLADUNG, nie aus dem Body: sonst könnte ein gültiges
 * Token für eine fremde Community eingelöst werden.
 *
 * Idempotent und rückkehrfähig: existiert die Mitgliedschaft schon (Unique-Index
 * über das Tripel), wird sie AKTUALISIERT — genau das macht die Wieder-Einladung
 * einer entfernten Person möglich (status zurück auf 'active', Rolle neu).
 * Fehlermeldungen bleiben generisch, damit das Token kein Orakel wird.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** Aus dem Mail-Link. */
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /**
   * Aus der eigenen Einladungs-Liste (/api/control/community/invites/mine) — für den
   * Weg ohne Mail-Link. Sicher, weil die Adressgleichheit unten GENAUSO geprüft
   * wird: eine fremde inviteId zu erraten hilft nicht, sie gehört zu einer
   * anderen Adresse.
   */
  inviteId: z.string().min(1).max(36).optional(),
  /**
   * Die Community des Hosts, auf dem angenommen wird (PK1 E1b-2). Die
   * Runtime schickt sie auf der eigenen Domain einer Community im Modus
   * `write` mit: dort darf nur eine Einladung in GENAU diese Community
   * angenommen werden. Fehlt sie, gilt das Verhalten von vorher.
   */
  expectedCommunityId: z.string().min(1).max(36).optional(),
}).strict().refine(body => Boolean(body.token) !== Boolean(body.inviteId), {
  message: 'Either token or inviteId',
})

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  let invite: CommunityInviteRow | null = null
  if (body.token) {
    const { rows } = await admin.tablesDB.listRows<CommunityInviteRow>({
      databaseId,
      tableId: COMMUNITY_INVITES_TABLE,
      queries: [Query.equal('tokenHash', hashInviteToken(body.token)), Query.limit(1)],
    }).catch((error) => { throw toH3Error(error, 'Could not read invitation') })
    invite = rows[0] ?? null
  }
  else if (body.inviteId) {
    invite = await admin.tablesDB.getRow<CommunityInviteRow>({
      databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: body.inviteId,
    }).catch(softFail('control:api/control/community/members/accept.post:getRow', null))
  }

  const expired = invite ? Date.parse(invite.expiresAt) < Date.now() : true
  if (!invite || invite.status !== 'pending' || expired) {
    throw createError({ status: 400, statusText: 'Invalid or expired invitation' })
  }
  if (body.expectedCommunityId && invite.communityId !== body.expectedCommunityId) {
    throw createError({ status: 403, statusText: 'Invitation belongs to a different community', data: { code: 'invite_other_community' } })
  }
  if (invite.email.trim().toLowerCase() !== (identity.email ?? '').trim().toLowerCase()) {
    throw createError({ status: 403, statusText: 'Invitation was issued for a different email address' })
  }
  /**
   * … UND die Adresse muss BESTÄTIGT sein (Sicherheits-Audit 2026-08-02, HOCH).
   *
   * Der dritte Beweis oben heißt „E-Mail-Gleichheit", und das war zu wenig: der
   * Pool ist EIN Appwrite-Projekt, in dem sich jeder mit jeder Adresse
   * registrieren und sofort loslegen kann — die Bestätigung blockiert nichts.
   * Wer also wusste, dass `chef@verein.de` als admin eingeladen wurde und dort
   * kein Konto hatte, legte sich auf irgendeinem offenen Pool-Host eines mit
   * genau dieser Adresse an und nahm die Einladung an, ohne je an das Postfach
   * zu kommen. Aus „nur der Eingeladene" wurde damit „jeder, der den Namen
   * kennt" — inklusive der Rolle, die in der Einladung stand.
   *
   * Der Grund reist als `email_unverified` mit (der Transport hebt ihn ins
   * `reason` des Envelopes): eine Einladung, die ohne Erklärung scheitert,
   * schickt den Eingeladenen zum Absender statt in sein Postfach. Ein Orakel
   * ist das nicht — wer hier ankommt, führt bereits die passende Adresse.
   */
  if (!identity.emailVerified) {
    logEvent('info', 'site.invite_unverified_email', {
      communityId: invite.communityId,
      inviteId: invite.$id,
      runtimeUserId: identity.userId,
    })
    throw createError({
      status: 403,
      statusText: 'Email address is not confirmed yet',
      data: { code: 'email_unverified' },
    })
  }

  // Die Community muss zu dem Projekt gehören, gegen das das JWT geprüft wurde —
  // sonst entstünde eine Mitgliedschaft mit fremder Runtime-Identität.
  //
  // … UND sie muss in Betrieb sein (SEC-028): eine stillgelegte Community
  // (`status: 'disabled'`, `community/delete.post.ts`) nimmt niemanden mehr
  // auf — dieselbe Regel wie der Host-Resolver (`status !== 'active'` ⇒ kein
  // Mandant). Die Antwort ist die neutrale wie bei einer ungültigen Einladung.
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: invite.communityId,
  }).catch(softFail('control:api/control/community/members/accept.post:getRow#2', null))
  if (!tenant || tenant.projectId !== identity.projectId || tenant.status !== 'active') {
    throw createError({ status: 400, statusText: 'Invalid or expired invitation' })
  }

  const { rows: existing } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('communityId', invite.communityId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const current = existing[0]
  if (current) {
    // Rückkehr oder Rollen-Wechsel per Einladung. Einen OWNER stuft eine
    // Einladung nie zurück — sonst könnte ein Admin den Inhaber per Mail
    // degradieren.
    await admin.tablesDB.updateRow<CommunityMemberRow>({
      databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: current.$id,
      data: {
        status: 'active',
        removedAt: null,
        ...(current.role === 'owner' ? {} : { role: invite.role }),
        email: identity.email ?? current.email,
      },
    }).catch((error) => { throw toH3Error(error, 'Could not activate membership') })
  }
  else {
    await admin.tablesDB.createRow<CommunityMemberRow>({
      databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: ID.unique(),
      data: {
        communityId: invite.communityId,
        runtimeProjectId: identity.projectId,
        runtimeUserId: identity.userId,
        role: invite.role,
        status: 'active',
        email: identity.email ?? invite.email,
        removedAt: null,
      },
    }).catch((error) => { throw toH3Error(error, 'Could not create membership') })
  }

  await admin.tablesDB.updateRow({
    databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id,
    data: { status: 'accepted', acceptedBy: identity.userId },
  }).catch(softFail('control:api/control/community/members/accept.post:updateRow', undefined))

  logEvent('info', 'site.invite_accepted', {
    communityId: invite.communityId,
    inviteId: invite.$id,
    runtimeUserId: identity.userId,
    role: invite.role,
  })

  /**
   * `invitedBy` reist MIT (F57 Mechanik 2) — der Runtime-Aufrufer schreibt
   * damit das Abzeichen `promoter` gut.
   *
   * WARUM NICHT HIER GUTGESCHRIEBEN WIRD: `member_counters` liegt im
   * RUNTIME-Projekt, das Control Plane hat dafür keinen Schlüssel — dieselbe
   * Grenze wie bei `revokeCommunityLabel` (A5) und der Verzugs-Meldung (C15).
   * Also dieselbe Arbeitsteilung: das Control Plane stellt fest, die Runtime
   * bucht.
   *
   * Der Wert ist eine RUNTIME-User-Id (so schreibt ihn `invite.post.ts`) und
   * kann '' sein — bei Einladungen aus der Zeit vor control-019. Der Aufrufer
   * muss das prüfen; hier bleibt der Rohwert stehen, damit die Route nicht
   * beurteilt, was sie nur weiterreicht.
   */
  return { ok: true, communityId: invite.communityId, host: tenant.host, role: invite.role, invitedBy: invite.invitedBy ?? '' }
})
