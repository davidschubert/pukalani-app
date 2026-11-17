import { removePageVersions } from '../../utils/pageRows'

/**
 * Admin: eine Seite (alle Sprachversionen) löschen.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate, dieselbe
 * Begründung wie beim Speichern (index.put.ts).
 */
export default defineEventHandler(async (event) => {
  const { actor } = await requireCommunityPermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const db = tenantDb(event, { as: 'operator', actor })
  // ALLE Fassungen, Runde um Runde, bis keine mehr da ist (KK1 c) — vorher
  // `limit(50)`: darüber blieben Fassungen stehen, und die Antwort sagte
  // trotzdem „gelöscht". Begründung und Deckel: server/utils/pageRows.ts.
  // Die öffentliche Liste wird in JEDEM Ausgang verworfen, auch nach einem
  // Teil-Löschen — sonst zeigte die Navigation bis zu 30 Sekunden auf eine
  // gelöschte Fassung (server/utils/publicPagesCache.ts).
  const result = await removePageVersions(db, slug, {
    logName: 'pages.delete_incomplete',
    scope: tenantCacheScope(event),
  }).catch((error) => {
    forgetPublicPages(event)
    throw toH3Error(error, 'Could not delete page')
  })
  forgetPublicPages(event)

  // Ehrlich statt „gelöscht": steht nach dem Deckel noch etwas, ist die Seite
  // nicht weg. Ein erneutes Löschen macht dort weiter.
  if (result.remaining > 0) {
    throw createError({ status: 500, statusText: 'Could not delete page', data: { code: 'delete_incomplete' } })
  }

  return { deleted: result.deleted }
})
