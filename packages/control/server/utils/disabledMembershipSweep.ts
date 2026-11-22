import { Query } from 'node-appwrite'
import type { TablesDB } from 'node-appwrite'
import {
  DISABLED_MEMBERSHIP_SWEEP_MAX_ROWS,
  resolveDisabledMembershipSweepMode,
  type DisabledMembershipSweepMode,
  type DisabledMembershipSweepReport,
} from '../../shared/disabledMembershipSweep'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Der zweite Sicherungs-Lauf (SI1 b) — Regel und Schalter:
 * `shared/disabledMembershipSweep.ts`.
 *
 * LIVE NUR ZÄHLEND: Layer-Vorgabe `dry-run`, keine App schaltet `apply`.
 * `dry-run` liest nur (zwei Listen) und schreibt eine Zeile
 * `community_members.disabled_sweep_dry_run`.
 *
 * `apply` liest VOR jedem Schreiben frisch (Zeile noch `active`? Community
 * noch `disabled`?) und stellt nur dann um — `status: 'removed'` mit
 * `removedAt`, wie das Stilllegen. Zwei gleichzeitige Läufe schreiben
 * höchstens dieselbe Zeile zweimal; eine wieder geöffnete Community bleibt
 * unberührt. Das Label im Pool-Projekt nimmt danach der stündliche
 * Label-Abgleich der Platform-App über seinen normalen Weg (Zeile `removed`).
 */

export interface DisabledMembershipSweepDeps {
  tablesDB: TablesDB
  databaseId: string
  now?: () => Date
}

const IDS_PER_QUERY = 100
const PAGE_SIZE = 100
/** Deckel der Community-Liste (wie der Leser des Label-Abgleichs). */
const MAX_DISABLED_COMMUNITIES = 5000

/** Der Schalter aus der app.config — unbekannt ⇒ `off`. */
export function disabledMembershipSweepConfiguredMode(): DisabledMembershipSweepMode {
  const appConfig = useAppConfig() as { pukalani?: { control?: { disabledMembershipSweep?: unknown } } }
  return resolveDisabledMembershipSweepMode(appConfig.pukalani?.control?.disabledMembershipSweep)
}

function defaultDeps(): DisabledMembershipSweepDeps {
  const config = useRuntimeConfig()
  return { tablesDB: createAdminClient().tablesDB, databaseId: config.public.appwriteDatabaseId }
}

async function listDisabledCommunityIds(tablesDB: TablesDB, databaseId: string): Promise<{ ids: string[], truncated: boolean }> {
  const ids: string[] = []
  let cursor: string | null = null
  while (ids.length < MAX_DISABLED_COMMUNITIES) {
    const { rows }: { rows: TenantRow[] } = await tablesDB.listRows<TenantRow>({
      databaseId,
      tableId: COMMUNITIES_TABLE,
      queries: [
        Query.equal('status', 'disabled'),
        Query.select(['$id']),
        Query.limit(PAGE_SIZE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })
    for (const row of rows) ids.push(row.$id)
    if (rows.length < PAGE_SIZE) return { ids, truncated: false }
    cursor = rows.at(-1)?.$id ?? null
    if (!cursor) return { ids, truncated: false }
  }
  return { ids: ids.slice(0, MAX_DISABLED_COMMUNITIES), truncated: true }
}

async function listActiveRows(
  tablesDB: TablesDB,
  databaseId: string,
  communityIds: string[],
): Promise<{ rows: CommunityMemberRow[], truncated: boolean }> {
  const out: CommunityMemberRow[] = []
  for (let start = 0; start < communityIds.length; start += IDS_PER_QUERY) {
    const chunk = communityIds.slice(start, start + IDS_PER_QUERY)
    let cursor: string | null = null
    for (;;) {
      const { rows }: { rows: CommunityMemberRow[] } = await tablesDB.listRows<CommunityMemberRow>({
        databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        queries: [
          Query.equal('communityId', chunk),
          Query.equal('status', 'active'),
          Query.limit(PAGE_SIZE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      })
      out.push(...rows)
      if (out.length > DISABLED_MEMBERSHIP_SWEEP_MAX_ROWS) {
        return { rows: out.slice(0, DISABLED_MEMBERSHIP_SWEEP_MAX_ROWS), truncated: true }
      }
      if (rows.length < PAGE_SIZE) break
      cursor = rows.at(-1)?.$id ?? null
      if (!cursor) break
    }
  }
  return { rows: out, truncated: false }
}

export async function runDisabledMembershipSweep(
  options: { mode: 'dry-run' | 'apply' },
  deps: DisabledMembershipSweepDeps = defaultDeps(),
): Promise<DisabledMembershipSweepReport> {
  const { tablesDB, databaseId } = deps
  const now = deps.now ?? (() => new Date())
  const communities = await listDisabledCommunityIds(tablesDB, databaseId)
  const active = await listActiveRows(tablesDB, databaseId, communities.ids)

  const report: DisabledMembershipSweepReport = {
    mode: options.mode,
    disabledCommunities: communities.ids.length,
    affectedCommunities: new Set(active.rows.map(row => row.communityId)).size,
    activeRows: active.rows.length,
    removed: 0,
    skipped: 0,
    failed: 0,
    truncated: communities.truncated || active.truncated,
  }

  if (options.mode === 'apply') {
    for (const listed of active.rows) {
      try {
        const fresh = await tablesDB.getRow<CommunityMemberRow>({ databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: listed.$id })
        const community = await tablesDB.getRow<TenantRow>({
          databaseId, tableId: COMMUNITIES_TABLE, rowId: fresh.communityId, queries: [Query.select(['status'])],
        })
        if (fresh.status !== 'active' || community.status !== 'disabled') {
          report.skipped++
          continue
        }
        await tablesDB.updateRow<CommunityMemberRow>({
          databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: fresh.$id,
          data: { status: 'removed', removedAt: now().toISOString() },
        })
        report.removed++
      }
      catch {
        // Eine Zeile darf die anderen nicht aufhalten; der Lauf wirft danach
        // (Plugin) und zählt so als gescheitert.
        report.failed++
      }
    }
  }

  logEvent(report.activeRows || report.truncated ? 'warn' : 'info', `community_members.disabled_sweep_${options.mode === 'apply' ? 'applied' : 'dry_run'}`, {
    disabledCommunities: report.disabledCommunities,
    affectedCommunities: report.affectedCommunities,
    activeRows: report.activeRows,
    removed: report.removed,
    skipped: report.skipped,
    failed: report.failed,
    truncated: report.truncated,
  })
  return report
}
