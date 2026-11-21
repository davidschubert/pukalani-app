import { Query } from 'node-appwrite'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'
import {
  INVITE_REQUESTS_TABLE,
  evaluateReminder,
  summarizeRequests,
  type InviteRequestRow,
} from '../../../../shared/types/inviteRequest'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { softFailWith } from '../../../../../core/server/utils/softFail'

/**
 * Betreiber: die Warteschlange (sites.manage).
 *
 * Liefert je Anfrage auch das, was der Betreiber zum Entscheiden braucht,
 * ohne selbst nachschlagen zu müssen: wann läuft der zugewiesene Code ab, darf
 * gerade erinnert werden, und — falls eingelöst — WELCHE Community daraus
 * wurde. Der Klartext eines Codes kommt hier nie vor; es gibt ihn nicht mehr.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const now = Date.now()

  const { rows, total } = await admin.tablesDB.listRows<InviteRequestRow>({
    databaseId,
    tableId: INVITE_REQUESTS_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  })

  // Codes und Sites in EINEM Rutsch nachladen statt pro Zeile — sonst wird die
  // Liste bei 50 Anfragen zu 100 Einzelabfragen.
  const codeIds = [...new Set(rows.map(row => row.inviteCodeId).filter(Boolean))]
  const communityIds = [...new Set(rows.map(row => row.communityId).filter(Boolean))]

  /**
   * NACHGESCHLAGENES DARF FEHLEN, ABER NICHT ALS „NICHTS" GELTEN (Bahn 2,
   * Q13-Stelle 3). Vorher sah eine Anfrage nach einem Lesefehler aus wie
   * „ohne Code" — und „Erinnern" blieb klickbar, ohne dass jemand wusste, ob
   * der Code noch gilt. Die Liste selbst bleibt sichtbar (die Warteschlange
   * ist wichtiger als ihre Zusatzangaben); `incomplete` nennt, was fehlt, und
   * eine Anfrage MIT Code ist dann nicht erinnerbar (`code-unknown`).
   */
  const incomplete: Array<'codes' | 'communities'> = []
  const [codes, sites] = await Promise.all([
    codeIds.length
      ? admin.tablesDB.listRows<InviteCodeRow>({
          databaseId, tableId: INVITE_CODES_TABLE,
          queries: [Query.equal('$id', codeIds), Query.limit(100)],
        }).then(res => res.rows).catch(softFailWith('control:api/control/invite-requests/index.get:listRows', () => {
          incomplete.push('codes')
          return [] as InviteCodeRow[]
        }))
      : Promise.resolve([] as InviteCodeRow[]),
    communityIds.length
      ? admin.tablesDB.listRows<TenantRow>({
          databaseId, tableId: COMMUNITIES_TABLE,
          queries: [Query.equal('$id', communityIds), Query.limit(100)],
        }).then(res => res.rows).catch(softFailWith('control:api/control/invite-requests/index.get:listRows#2', () => {
          incomplete.push('communities')
          return [] as TenantRow[]
        }))
      : Promise.resolve([] as TenantRow[]),
  ])

  const codeById = new Map(codes.map(row => [row.$id, row]))
  const hostById = new Map(sites.map(row => [row.$id, row.host]))

  const codesUnknown = incomplete.includes('codes')

  return {
    total,
    incomplete,
    stats: summarizeRequests(rows),
    requests: rows.map((row) => {
      const code = row.inviteCodeId ? codeById.get(row.inviteCodeId) : undefined
      const reminder = evaluateReminder(row, now)
      const codeUnknown = codesUnknown && Boolean(row.inviteCodeId)
      return {
        id: row.$id,
        email: row.email,
        note: row.note,
        status: row.status || 'new',
        createdAt: row.$createdAt,
        assignedAt: row.assignedAt,
        redeemedAt: row.redeemedAt,
        host: row.communityId ? hostById.get(row.communityId) ?? '' : '',
        reminders: row.reminders ?? 0,
        lastReminderAt: row.lastReminderAt,
        codeExpiresAt: code?.expiresAt ?? null,
        codeStatus: code?.status ?? '',
        canRemind: reminder.allowed && !codeUnknown,
        remindBlocked: codeUnknown ? 'code-unknown' : reminder.reason ?? '',
        remindSuggested: reminder.suggested,
      }
    }),
  }
})
