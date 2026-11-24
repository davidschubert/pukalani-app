import type { H3Event } from 'h3'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { softFailStatus } from '../../../core/server/utils/softFail'

/**
 * Die Community einer Pool-Naht laden — für den Betreiber-Weg „verwaister
 * Inhaber-Platz" (LA2). Gehört sie nicht zu genau diesem Runtime-Projekt oder
 * gibt es die Zeile nicht, ist die Antwort 404 (ob es die Id anderswo gibt,
 * schuldet die Route niemandem).
 *
 * ANDERS als `team.post.ts` wird ein Lesefehler NICHT zu „unbekannt": hier
 * folgt ein Schreibvorgang, und „Appwrite antwortete gerade 500" darf nicht
 * wie „gibt es nicht" aussehen. Nur ein 404 der Zeile ist ein 404.
 */
export async function loadPoolCommunity(
  event: H3Event,
  communityId: string,
  runtimeProjectId: string,
): Promise<TenantRow> {
  const admin = createAdminClient(event)
  let tenant: TenantRow
  try {
    tenant = await admin.tablesDB.getRow<TenantRow>({
      databaseId: useRuntimeConfig(event).public.appwriteDatabaseId,
      tableId: COMMUNITIES_TABLE,
      rowId: communityId,
    })
  }
  catch (error) {
    if (softFailStatus(error) === 404) throw createError({ status: 404, statusText: 'Site not found' })
    throw toH3Error(error, 'Could not read community')
  }
  if (tenant.projectId !== runtimeProjectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }
  return tenant
}

/** Anzeigename einer Community — Name, ersatzweise Host, ersatzweise Id. */
export function communityDisplayName(tenant: TenantRow): string {
  return tenant.name || tenant.host || tenant.$id
}
