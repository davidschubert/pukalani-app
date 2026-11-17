import { PAGES_TABLE, type PageRow, type PagesListResponse } from '../../../shared/types/page'
import { ADMIN_PAGES_MAX, ADMIN_PAGES_PAGE_SIZE, buildAdminPageGroups, listPageRowsPaged } from '../../utils/pageRows'

/** Admin: alle Seiten, nach slug gruppiert (das aufklappbare Menü). */
export default defineEventHandler(async (event): Promise<PagesListResponse> => {
  await requireCommunityPermission(event, 'pages.manage')

  // Datentür statt Hand-Scope (scopeQuery) — gleicher Filter, eine Autorität.
  // Geblättert statt `limit(500)` (KK1 c): eine Zeile je Seite UND Sprache,
  // ab der 501. fehlten Seiten ohne Hinweis. Sortiert wird im Speicher
  // (buildAdminPageGroups) — Begründung und Netz in server/utils/pageRows.ts.
  const { rows, capped } = await listPageRowsPaged<PageRow>(tenantDb(event, { as: 'operator' }), PAGES_TABLE, [], {
    pageSize: ADMIN_PAGES_PAGE_SIZE,
    maxRows: ADMIN_PAGES_MAX,
    logName: 'pages.admin_list_capped',
    scope: tenantCacheScope(event),
  }).catch((error) => {
    throw toH3Error(error, 'Could not load pages')
  })

  // Die Regeln stehen in der Liste, auch wenn es sie als Zeile noch nicht
  // gibt (F1, Davids Entscheidung 2) — Begründung an buildAdminPageGroups.
  const groups = buildAdminPageGroups(rows, guidelinesFallbackEnabled())
  // Ob der Übersetzen-Knopf überhaupt erscheinen darf (F60) — dieselbe Frage
  // wie in der Kategorie-Verwaltung, dieselbe Antwort an derselben Stelle:
  // beim Laden der Liste, nicht als zweite Route.
  // `truncated`: das Netz hat gegriffen — die Seite sagt es, statt still
  // eine kürzere Liste zu zeigen.
  return { groups, aiTranslate: await isAiConfigured(event), truncated: capped }
})
