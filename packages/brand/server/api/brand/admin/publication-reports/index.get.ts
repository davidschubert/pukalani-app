import { createBrandPublicationReportListQuerySchema } from '../../../../../schemas/brandPublication'
import type { BrandPublicationReportListResponse } from '../../../../../shared/types/brand'
import {
  brandPublicationAdminUnavailable,
  countBrandPublicationReports,
  listBrandPublicationReportRows,
  loadBrandPublicationTitles,
  requireBrandPublicationOperator,
  toBrandPublicationReport,
} from '../../../../utils/brandPublications'

/**
 * BETREIBER: DIE MELDUNGEN LESEN (`users.manage`,
 * docs/plans/DISCOVER-BRANDS.md §4.4 „Meldungen (offen/erledigt)").
 *
 * ── DER STANDARD IST `open` ───────────────────────────────────────────────
 * Das ist die Arbeitsliste. Erledigtes bleibt stehen, damit dieselbe Sache
 * nicht ein zweites Mal entschieden wird.
 *
 * ── DIE GEMELDETE MARKE REIST MIT, IN EINER ABFRAGE ───────────────────────
 * Eine Meldung ohne Titel und Adresse ist eine Row-Id und die Aufforderung,
 * selbst nachzuschlagen. Geholt wird sie gebündelt — eine Liste mit fünfzig
 * Zeilen darf nicht fünfzig Fragen stellen.
 *
 * ── `ipHash` GEHT NICHT HINAUS ────────────────────────────────────────────
 * Er ist die Drossel-Kennung des Melders und hat in einem Browser-Fenster
 * nichts verloren; `toBrandPublicationReport` lässt ihn draussen, und weil
 * jede Route durch sie muss, kann keine es vergessen.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationReportListResponse> => {
  requireBrandPublicationOperator(event)

  const query = await getValidatedQuery(event, createBrandPublicationReportListQuerySchema().parse)

  let rows
  let total: number
  try {
    const page = await listBrandPublicationReportRows(event, {
      filter: query.status,
      limit: query.limit,
      cursor: query.cursor,
    })
    rows = page.rows
    total = page.total
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { filter: query.status, stage: 'reports' })
  }

  const publications = await loadBrandPublicationTitles(event, rows.map(row => row.publicationId))

  return {
    items: rows.map(row => toBrandPublicationReport(row, publications.get(row.publicationId))),
    total,
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
    counts: await countBrandPublicationReports(event),
  }
})
