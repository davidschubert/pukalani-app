import { Query } from 'node-appwrite'
import { guidelinesFallbackEditorRows } from '../../../shared/guidelinesFallback'
import { GUIDELINES_SLUG, PAGES_TABLE, type PageDetailResponse, type PageEditorRow, type PageRow } from '../../../shared/types/page'
import { listPageRowsPaged, PAGE_VERSIONS_MAX, PAGE_VERSIONS_PAGE_SIZE } from '../../utils/pageRows'

/**
 * Admin: alle Sprachversionen einer Seite (inkl. body) zum Bearbeiten.
 *
 * `isTemplate` sagt dem Editor, dass hinter dem, was er anzeigt, noch KEINE
 * Zeile steht (heute nur `guidelines` — Begründung in
 * shared/guidelinesFallback.ts). Er füllt sich dann mit der Vorlage, und das
 * erste Speichern legt die Seite an; „Löschen" gibt es dort nicht, weil es
 * nichts zu löschen gäbe.
 */
export default defineEventHandler(async (event): Promise<PageDetailResponse> => {
  await requireCommunityPermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }
  // Alle Fassungen, geblättert (KK1 c) — vorher `limit(20)`, darüber fehlten
  // Sprachen im Editor ohne Hinweis. Netz und Log: server/utils/pageRows.ts.
  const res = await listPageRowsPaged<PageRow>(tenantDb(event, { as: 'operator' }), PAGES_TABLE, [
    Query.equal('slug', slug),
  ], {
    pageSize: PAGE_VERSIONS_PAGE_SIZE,
    maxRows: PAGE_VERSIONS_MAX,
    logName: 'pages.versions_capped',
    scope: tenantCacheScope(event),
  }).catch((error) => {
    throw toH3Error(error, 'Could not load page')
  })

  if (!res.rows.length && slug === GUIDELINES_SLUG && guidelinesFallbackEnabled()) {
    return { rows: guidelinesFallbackEditorRows(), isTemplate: true }
  }

  const rows: PageEditorRow[] = res.rows.map(row => ({
    locale: row.locale,
    title: row.title,
    body: row.body,
    status: row.status,
    sortOrder: row.sortOrder,
  }))
  return { rows, isTemplate: false }
})
