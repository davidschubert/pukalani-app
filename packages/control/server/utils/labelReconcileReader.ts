import { Client, Query, TablesDB } from 'node-appwrite'
import {
  membershipGrantsAccess,
  type LabelReconcileReader,
  type RemovedMembership,
  type RemovedMembershipPage,
} from '../../shared/labelReconcile'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'

/**
 * LESER DES LABEL-ABGLEICHS (SEC-024, seit 2026-11-13) — dieselbe Bauart wie
 * `createPastDueNoticeReader`: Cross-Projekt-Read mit dem read-only-Schlüssel
 * `NUXT_PLATFORM_CONTROL_*` (Scope `rows.read`), Verbindungsdaten EXPLIZIT bei
 * der Registrierung, ohne `H3Event` (der Aufrufer ist ein Intervall-Plugin der
 * Platform-App). `community_members` gehört dem Control Plane (A14); die
 * Platform-App bekommt nur Kennungen.
 *
 * ZWEI FRAGEN:
 *  1. `listRemoved` — alle `status='removed'` des Runtime-Projekts, seitenweise
 *     mit ausdrücklichem `Query.limit` und Cursor. Höchstens `limit` Zeilen je
 *     Lauf; was darüber liegt, wird NICHT still abgeschnitten — `nextCursor`
 *     sagt, wo der nächste Lauf weitermacht.
 *  2. `hasAccess` — gibt es für dasselbe Paar (Community, Konto) eine Zeile MIT
 *     Zugang? Der Unique-Index `uq_member` (control-023) lässt je Paar nur EINE
 *     Zeile zu, und eine neue Einladung stellt GENAU DIESE Zeile wieder auf
 *     `active` (control/api/control/community/members/accept.post.ts, Zweig
 *     `current`); `join.post.ts` legt nur an, wenn es keine gibt. Die Frage
 *     klingt also überflüssig — sie wird trotzdem FRISCH gestellt, unmittelbar
 *     vor dem Entzug: zwischen `listRemoved` und dem Schreiben kann die Person
 *     neu eingeladen worden sein, und dann wäre die gelesene `removed`-Zeile
 *     schon Geschichte.
 *
 * BEWUSST KEIN CACHE (wie beim Zahlungs-Leser): einmal pro Stunde, und ein
 * Cache wäre hier genau die Stelle, an der eine Rückkehr noch alt aussieht.
 */

export interface LabelReconcileReaderOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
}

/** Zeilen je Abfrage (Appwrite-Obergrenze für eine Seite ist großzügiger). */
const PAGE_SIZE = 100

export function createLabelReconcileReader(options: LabelReconcileReaderOptions): LabelReconcileReader {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  return createLabelReconcileReaderFor(tablesDB, options.databaseId)
}

/** Dieselbe Logik mit einem fertigen Client — für Tests. */
export function createLabelReconcileReaderFor(tablesDB: TablesDB, databaseId: string): LabelReconcileReader {
  return {
    async listRemoved(runtimeProjectId, { limit, after }): Promise<RemovedMembershipPage> {
      if (!runtimeProjectId || limit <= 0) return { rows: [], nextCursor: null }
      const collected: RemovedMembership[] = []
      let cursor = after
      // Eine Zeile MEHR holen als erlaubt: nur so lässt sich „genau am Deckel
      // fertig" von „dahinter geht es weiter" unterscheiden.
      while (collected.length <= limit) {
        const want = Math.min(PAGE_SIZE, limit + 1 - collected.length)
        const { rows } = await tablesDB.listRows<CommunityMemberRow>({
          databaseId,
          tableId: COMMUNITY_MEMBERS_TABLE,
          queries: [
            Query.equal('status', 'removed'),
            Query.equal('runtimeProjectId', runtimeProjectId),
            Query.limit(want),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        })
        for (const row of rows) {
          collected.push({ rowId: row.$id, communityId: row.communityId, userId: row.runtimeUserId })
        }
        if (rows.length < want) break
        cursor = rows.at(-1)?.$id ?? null
        if (!cursor) break
      }
      if (collected.length > limit) {
        const page = collected.slice(0, limit)
        return { rows: page, nextCursor: page.at(-1)?.rowId ?? null }
      }
      return { rows: collected, nextCursor: null }
    },

    async hasAccess(runtimeProjectId, communityId, userId): Promise<boolean> {
      const { rows } = await tablesDB.listRows<CommunityMemberRow>({
        databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        queries: [
          Query.equal('communityId', communityId),
          Query.equal('runtimeProjectId', runtimeProjectId),
          Query.equal('runtimeUserId', userId),
          // Mehr als eine Zeile verbietet uq_member; 5 ist das Netz für einen
          // Datenfehler, der sonst eine `active`-Zeile hinter einer anderen verbärge.
          Query.limit(5),
        ],
      })
      return rows.some(row => membershipGrantsAccess(row.status))
    },
  }
}
