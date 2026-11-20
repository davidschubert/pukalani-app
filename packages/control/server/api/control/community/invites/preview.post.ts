import { Query } from 'node-appwrite'
import { z } from 'zod'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { hashInviteToken } from '../../../../utils/communityTeam'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Wem gehört diese Einladung? — die EINE Frage, die man ohne Konto stellen darf.
 *
 * Gebraucht, damit eine geschlossene Community für Eingeladene ÜBERHAUPT
 * betretbar ist (Davids Entscheidung 2026-08-15): Der Kern lässt die
 * Registrierung nur für die eingeladene Adresse durch und muss dafür wissen,
 * welche das ist — zu einem Zeitpunkt, an dem es die Person als Konto noch
 * nicht gibt. Genau deshalb hat diese Route KEIN JWT: es gibt noch keine
 * Identität zu prüfen. Die drei anderen Beweise bleiben:
 *
 *  1. **Service-Secret** — der Aufrufer ist unser eigenes Deployment.
 *  2. **Der Token selbst** — 64 Hex, nur im Mail-Link, in der DB liegt bloss
 *     sein SHA-256. Wer ihn hat, hat die Mail bekommen.
 *  3. **Die Community** — `communityId` kommt vom Aufrufer, aber die Einladung
 *     muss ihr GEHÖREN. Ein gültiges Token für Community A öffnet auf B
 *     nichts.
 *
 * WAS SIE VERRÄT UND WARUM DAS VERTRETBAR IST: die eingeladene Adresse und die
 * vorgesehene Rolle. Beides steht in derselben Mail wie der Token — wer fragen
 * kann, weiss es bereits. Ein Orakel über FREMDE Einladungen ist sie nicht:
 * ohne Token gibt es keine Antwort, und Token rät man nicht (2^256).
 *
 * ANTWORTET NUR MIT 200 ODER 404. Kein Unterschied zwischen „unbekannt",
 * „abgelaufen", „schon angenommen", „widerrufen" und „gehört einer anderen
 * Community" — jede Auskunft darüber wäre eine Auskunft über fremde
 * Einladungen.
 *
 * SIE VERBRAUCHT NICHTS. Die Einladung bleibt `pending`; eingelöst wird sie
 * erst beim Annehmen, und das verlangt weiterhin ein Konto MIT bestätigter
 * Adresse.
 */
const bodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  /** = tenants.$id der Community, auf deren Host gerade registriert wird. */
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const { rows } = await admin.tablesDB.listRows<CommunityInviteRow>({
    databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    queries: [Query.equal('tokenHash', hashInviteToken(body.token)), Query.limit(1)],
  }).catch(softFail('control:api/control/community/invites/preview.post:listRows', { rows: [] as CommunityInviteRow[] }))

  const invite = rows[0] ?? null
  const expired = invite ? Date.parse(invite.expiresAt) < Date.now() : true
  if (
    !invite
    || invite.status !== 'pending'
    || expired
    || invite.communityId !== body.communityId
  ) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  return {
    ok: true,
    email: invite.email.trim().toLowerCase(),
    role: invite.role,
  }
})
