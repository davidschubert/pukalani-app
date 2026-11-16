import { Client, Query, TablesDB } from 'node-appwrite'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import { resolveCustomDomainStatus } from '../../shared/customDomain'
import type { CustomDomainGraceNotice } from '../../shared/customDomainNotice'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'

/**
 * LESER der Communities mit laufender Frist der eigenen Domain (BE-014) —
 * dieselbe Bauart wie `createPastDueNoticeReader`: Cross-Projekt-Read mit dem
 * read-only-Key (`rows.read`), Verbindungsdaten EXPLIZIT bei der
 * Registrierung, ohne `H3Event` (der einzige Aufrufer ist ein Zeit-Lauf der
 * Platform-App).
 *
 * Geliefert wird nur, was der Hinweis-Lauf braucht: Communities DIESES
 * Pool-Projekts, Status `active`, Domain `active` UND ein Frist-Stempel. Eine
 * abgeschaltete (`paused`), eine leere oder eine ungestempelte Domain hat
 * keinen Hinweis. Solange der Fristen-Lauf des Control Plane nur ZÄHLT, steht
 * nirgends ein Stempel — dann liefert dieser Leser nichts, und es geht keine
 * Mail.
 *
 * BEWUSST KEIN CACHE (wie beim Zahlungsverzug): der Leser läuft stündlich.
 */

export interface CustomDomainNoticeReaderOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
  /** Nur für Tests: eine eigene Ablage. */
  tablesDB?: TablesDB
}

export type CustomDomainNoticeReader = (runtimeProjectId: string) => Promise<CustomDomainGraceNotice[]>

/** PURE: gehört diese Zeile in den Hinweis-Lauf DIESES Runtime-Projekts? */
export function communityHasCustomDomainGrace(
  row: Pick<TenantRow, 'status' | 'mode' | 'projectId' | 'tenantId' | 'customDomain' | 'customDomainStatus' | 'customDomainGraceEndsAt'>,
  runtimeProjectId: string,
): boolean {
  if (row.status !== 'active') return false
  if (row.mode !== 'pool' || !row.tenantId) return false
  if (!runtimeProjectId || row.projectId !== runtimeProjectId) return false
  if (!row.customDomain || resolveCustomDomainStatus(row.customDomainStatus) !== 'active') return false
  return Boolean(row.customDomainGraceEndsAt) && Number.isFinite(Date.parse(row.customDomainGraceEndsAt ?? ''))
}

export function createCustomDomainNoticeReader(options: CustomDomainNoticeReaderOptions): CustomDomainNoticeReader {
  const tablesDB = options.tablesDB ?? new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )

  return async (runtimeProjectId: string): Promise<CustomDomainGraceNotice[]> => {
    if (!runtimeProjectId) return []

    // VOLLSTÄNDIG (listAllRows) über den Index `idx_custom_domain`; die
    // übrigen Bedingungen sind wenige Zeilen und stehen in der puren Regel.
    const communities = await listAllRows<TenantRow>(
      tablesDB, options.databaseId, COMMUNITIES_TABLE, [Query.notEqual('customDomain', '')],
    )
    const due = communities.filter(row => communityHasCustomDomainGrace(row, runtimeProjectId))
    if (due.length === 0) return []

    // EINE Abfrage je 100 Communities für alle Owner (kein N+1 über
    // Projektgrenzen).
    const owners = new Map<string, string[]>()
    for (let i = 0; i < due.length; i += 100) {
      const chunk = due.slice(i, i + 100)
      const rows = await listAllRows<CommunityMemberRow>(
        tablesDB, options.databaseId, COMMUNITY_MEMBERS_TABLE, [
          Query.equal('communityId', chunk.map(row => row.$id)),
          Query.equal('runtimeProjectId', runtimeProjectId),
          Query.equal('role', 'owner'),
          Query.equal('status', 'active'),
        ],
      )
      for (const row of rows) {
        const list = owners.get(row.communityId) ?? []
        list.push(row.runtimeUserId)
        owners.set(row.communityId, list)
      }
    }

    return due.map(row => ({
      communityId: row.$id,
      tenantId: row.tenantId,
      host: row.host,
      name: row.name ?? '',
      domain: row.customDomain ?? '',
      graceEndsAt: row.customDomainGraceEndsAt as string,
      ownerUserIds: owners.get(row.$id) ?? [],
    }))
  }
}
