import { COMMUNITIES_TABLE } from '../../../../shared/types/tenantRecord'

/** Betreiber: Tenant-Row löschen (Host offline; Kundendaten im Pool bleiben —
 *  deren Lebenszyklus gehört zum künftigen Offboarding, nicht hierher). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing tenant id' })
  // RA3: der Host geht sofort offline, ein Zurück gibt es nicht ⇒ frische
  // Anmeldung (core/shared/recentAuth.ts), VOR dem Löschen.
  await requireRecentAuth(event)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Could not delete tenant') })
  return { ok: true }
})
