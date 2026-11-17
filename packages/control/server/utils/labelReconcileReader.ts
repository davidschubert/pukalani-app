import { Client, Query, TablesDB } from 'node-appwrite'
import {
  ROLES_WITHOUT_MODERATOR_LABEL,
  communityGrantsAccess,
  membershipGrantsAccess,
  roleCarriesModeratorLabel,
  type LabelReconcileReader,
  type MembershipList,
  type RemovedMembership,
  type RemovedMembershipPage,
} from '../../shared/labelReconcile'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

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
 *
 * SEIT SI1 b (2026-11-17) DREI WEITERE — der Lauf fand vorher nur `removed`:
 *  3. `listActiveInDisabled` — `active`-Zeilen in STILLGELEGTEN Communities
 *     (das Stilllegen konnte einzelne Zeilen nicht umstellen). Erst die
 *     stillgelegten Communities des Runtime-Projekts (Index `idx_status`,
 *     aus `tenants` mitkopiert), dann deren `active`-Zeilen je 100 Kennungen
 *     (Index `idx_community_status`). Und `hasAccess` fragt seitdem auch den
 *     Status der Community: `active`-Zeile in einer stillgelegten Community ist
 *     KEIN Zugang — frisch gefragt, eine wieder eingeschaltete Community schon.
 *  4. `listDemoted` — `active`-Zeilen mit einer Rolle OHNE Moderations-Label,
 *     geändert nach `since`, neueste zuerst (Appwrites eigener Index auf
 *     `$updatedAt`). Eine Herabstufung ist ein `updateRow` auf genau diese Zeile
 *     (`members/role.post.ts`) und bewegt `$updatedAt`.
 *  5. `moderatesNow` — trägt die Zeile des Paars JETZT eine Rolle MIT
 *     Moderations-Label? Frisch gefragt, unmittelbar vor dem Entzug.
 * Die Listen 3 und 4 haben keinen Fortsetzungs-Cursor: was über `limit` liegt,
 * meldet `truncated` (der Lauf schreibt eine Log-Zeile).
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

/** Höchstens so viele stillgelegte Communities je Lauf (Frage 3). */
export const MAX_DISABLED_COMMUNITIES = 1000

/** Kennungen je `Query.equal` (Appwrites Grenze für Werte-Listen ist 100). */
const IDS_PER_QUERY = 100

function toMembership(row: CommunityMemberRow): RemovedMembership {
  return { rowId: row.$id, communityId: row.communityId, userId: row.runtimeUserId }
}

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
        for (const row of rows) collected.push(toMembership(row))
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
      if (!rows.some(row => membershipGrantsAccess(row.status))) return false
      // SI1 b: eine `active`-Zeile in einer stillgelegten Community ist KEIN
      // Zugang. Frisch gelesen — ist sie wieder eingeschaltet, bleibt das Label.
      try {
        const community = await tablesDB.getRow<TenantRow>({
          databaseId,
          tableId: COMMUNITIES_TABLE,
          rowId: communityId,
          queries: [Query.select(['status'])],
        })
        return communityGrantsAccess(community.status)
      }
      catch (error) {
        // Community gibt es nicht mehr ⇒ niemand hat dort Zugang. Jede andere
        // Störung wirft (der Lauf zählt `failed` und entzieht NICHT).
        if ((error as { code?: unknown } | null)?.code === 404) return false
        throw error
      }
    },

    async listActiveInDisabled(runtimeProjectId, { limit }): Promise<MembershipList> {
      if (!runtimeProjectId || limit <= 0) return { rows: [], truncated: false }
      // 1. Die stillgelegten Communities dieses Runtime-Projekts (nur Kennungen).
      const disabledIds: string[] = []
      let truncated = false
      let communityCursor: string | null = null
      while (disabledIds.length <= MAX_DISABLED_COMMUNITIES) {
        const want = Math.min(PAGE_SIZE, MAX_DISABLED_COMMUNITIES + 1 - disabledIds.length)
        const { rows }: { rows: TenantRow[] } = await tablesDB.listRows<TenantRow>({
          databaseId,
          tableId: COMMUNITIES_TABLE,
          queries: [
            Query.equal('status', 'disabled'),
            Query.equal('projectId', runtimeProjectId),
            Query.select(['$id']),
            Query.limit(want),
            ...(communityCursor ? [Query.cursorAfter(communityCursor)] : []),
          ],
        })
        for (const row of rows) disabledIds.push(row.$id)
        if (rows.length < want) break
        communityCursor = rows.at(-1)?.$id ?? null
        if (!communityCursor) break
      }
      if (disabledIds.length > MAX_DISABLED_COMMUNITIES) {
        disabledIds.length = MAX_DISABLED_COMMUNITIES
        truncated = true
      }

      // 2. Deren `active`-Zeilen, je 100 Kennungen eine Abfrage, seitenweise.
      const collected: RemovedMembership[] = []
      for (let start = 0; start < disabledIds.length && collected.length <= limit; start += IDS_PER_QUERY) {
        const ids = disabledIds.slice(start, start + IDS_PER_QUERY)
        let cursor: string | null = null
        while (collected.length <= limit) {
          const want = Math.min(PAGE_SIZE, limit + 1 - collected.length)
          const { rows }: { rows: CommunityMemberRow[] } = await tablesDB.listRows<CommunityMemberRow>({
            databaseId,
            tableId: COMMUNITY_MEMBERS_TABLE,
            queries: [
              Query.equal('communityId', ids),
              Query.equal('status', 'active'),
              Query.equal('runtimeProjectId', runtimeProjectId),
              Query.limit(want),
              ...(cursor ? [Query.cursorAfter(cursor)] : []),
            ],
          })
          for (const row of rows) collected.push(toMembership(row))
          if (rows.length < want) break
          cursor = rows.at(-1)?.$id ?? null
          if (!cursor) break
        }
      }
      if (collected.length > limit) return { rows: collected.slice(0, limit), truncated: true }
      return { rows: collected, truncated }
    },

    async listDemoted(runtimeProjectId, { limit, since }): Promise<MembershipList> {
      if (!runtimeProjectId || limit <= 0 || ROLES_WITHOUT_MODERATOR_LABEL.length === 0) {
        return { rows: [], truncated: false }
      }
      const collected: RemovedMembership[] = []
      let cursor: string | null = null
      while (collected.length <= limit) {
        const want = Math.min(PAGE_SIZE, limit + 1 - collected.length)
        const { rows }: { rows: CommunityMemberRow[] } = await tablesDB.listRows<CommunityMemberRow>({
          databaseId,
          tableId: COMMUNITY_MEMBERS_TABLE,
          queries: [
            Query.equal('status', 'active'),
            Query.equal('runtimeProjectId', runtimeProjectId),
            Query.equal('role', [...ROLES_WITHOUT_MODERATOR_LABEL]),
            Query.greaterThan('$updatedAt', since),
            // Neueste zuerst: greift der Deckel, sieht der Lauf die frischen
            // Herabstufungen, und ältere hat ein früherer Lauf schon gesehen.
            Query.orderDesc('$updatedAt'),
            Query.limit(want),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        })
        for (const row of rows) collected.push(toMembership(row))
        if (rows.length < want) break
        cursor = rows.at(-1)?.$id ?? null
        if (!cursor) break
      }
      if (collected.length > limit) return { rows: collected.slice(0, limit), truncated: true }
      return { rows: collected, truncated: false }
    },

    async moderatesNow(runtimeProjectId, communityId, userId): Promise<boolean> {
      const { rows } = await tablesDB.listRows<CommunityMemberRow>({
        databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        queries: [
          Query.equal('communityId', communityId),
          Query.equal('runtimeProjectId', runtimeProjectId),
          Query.equal('runtimeUserId', userId),
          Query.limit(5),
        ],
      })
      return rows.some(row => membershipGrantsAccess(row.status) && roleCarriesModeratorLabel(row.role))
    },
  }
}
