import { Query } from 'node-appwrite'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../shared/types/website'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../shared/types/entitlement'
import { softFailStatus } from '../../../../../core/server/utils/softFail'

/**
 * Site aus dem Register entfernen (sites.manage) — entfernt NUR den
 * Register-Eintrag samt seiner Entitlement-Rows (Register-seitige Daten im
 * Control-Projekt), niemals das Appwrite-Projekt der Site oder dessen Daten
 * (Lösch-Lifecycle mit Export/Fristen ist L2, kommt mit dem Provisioner).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing site id' })
  }
  // RA3: Register-Eintrag UND Entitlements verschwinden, ohne Papierkorb ⇒
  // frische Anmeldung (core/shared/recentAuth.ts), VOR dem ersten Lesen.
  await requireRecentAuth(event)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const row = await admin.tablesDB.getRow<WebsiteRow>({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  /**
   * ERST DIE ENTITLEMENTS, DANN DER EINTRAG — UND KEIN „OK" ÜBER RESTE
   * (Bahn 2, Q13-Stelle 1). Vorher verschwand zuerst der Register-Eintrag,
   * danach wurden die Entitlements fail-soft gelesen und gelöscht: scheiterte
   * das, blieben sie liegen, die Route antwortete trotzdem `ok`, und ein
   * zweiter Versuch fand den Eintrag nicht mehr (404). Jetzt:
   *  - kann die Liste nicht gelesen werden ⇒ 503, NICHTS ist gelöscht;
   *  - scheitert das Löschen einer Entitlement-Zeile ⇒ 503, der Eintrag
   *    BLEIBT — derselbe Klick noch einmal räumt den Rest ab;
   *  - erst wenn keine Zeile übrig ist, geht der Eintrag selbst.
   * Ein automatisches Aufräumen gibt es bewusst nicht (es löschte Daten
   * ohne Klick); was dafür nötig wäre, steht in OPEN-ITEMS-COMPLETE „Bahn 2".
   */
  const { rows: entitlements } = await admin.tablesDB.listRows<EntitlementRow>({
    databaseId, tableId: ENTITLEMENTS_TABLE,
    queries: [Query.equal('siteProjectId', row.projectId), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not read site entitlements') })

  const results = await Promise.allSettled(entitlements.map(entitlement =>
    admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: entitlement.$id }),
  ))
  // 404 heißt „schon weg" (ein paralleler Klick) — das ist kein Rest.
  const left = results.filter(result => result.status === 'rejected' && softFailStatus(result.reason) !== 404).length
  if (left > 0) {
    logEvent('error', 'control.website_deregister_incomplete', { left, total: entitlements.length })
    throw createError({
      status: 503,
      statusText: 'Site entitlements could not be removed — try again',
      data: { code: 'entitlements_left' },
    })
  }

  await admin.tablesDB.deleteRow({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Could not deregister site') })

  return { ok: true, slug: row.slug }
})
