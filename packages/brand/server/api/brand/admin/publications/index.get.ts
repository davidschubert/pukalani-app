import { createBrandPublicationListQuerySchema } from '../../../../../schemas/brandPublication'
import type { BrandPublicationAdminListResponse } from '../../../../../shared/types/brand'
import {
  brandPublicationAdminUnavailable,
  countBrandPublications,
  listBrandPublicationRows,
  loadBrandPublicationOwners,
  loadBrandPublicationScores,
  requireBrandPublicationOperator,
  toBrandPublicationAdminItem,
} from '../../../../utils/brandPublications'

/**
 * BETREIBER: DIE VERÖFFENTLICHUNGEN LESEN (`users.manage`,
 * docs/plans/DISCOVER-BRANDS.md §4.4).
 *
 * ── DER STANDARD-FILTER IST `pending` ─────────────────────────────────────
 * Das ist die Arbeitsliste (Davids Entscheidung §9.1: Freigabe VOR
 * Veröffentlichung). Entschiedenes bleibt erreichbar — die Reiter zeigen ihre
 * Zähler —, aber wer die Seite öffnet, sieht das, was noch zu tun ist.
 *
 * ── ZWEI NACHSCHLÄGE, ZWEI ABFRAGEN, NICHT ZWEIMAL FÜNFZIG ────────────────
 * Der Eigentümer (aus `brand_profiles`) und die Zahl (aus `brand_checks`)
 * stehen nicht in der Zeile. Beide werden GEBÜNDELT geholt; eine Liste mit
 * fünfzig Zeilen darf nicht hundert Fragen stellen. Beide fail-soft: eine
 * fehlende Randspalte darf keine Arbeitsliste kosten.
 *
 * ── WAS NICHT MITREIST ────────────────────────────────────────────────────
 * Der Snapshot. Die Vorschau ist ein LINK auf die Anatomie und kein Abbild in
 * einer Tabellenzeile — bei bis zu 400 KB je Zeile wären hundert Zeilen sonst
 * 40 MB Antwort für eine Liste, die Titel und Zustand zeigt.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `users.manage`,
 * und der Kreis dieser Sessions ist der Betreiber selbst. Die IP-Eimer in
 * `05.rate-limit.ts` sind für die ÖFFENTLICHEN Wege da.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationAdminListResponse> => {
  requireBrandPublicationOperator(event)

  const query = await getValidatedQuery(event, createBrandPublicationListQuerySchema().parse)

  let rows
  let total: number
  try {
    const page = await listBrandPublicationRows(event, {
      filter: query.status,
      limit: query.limit,
      cursor: query.cursor,
    })
    rows = page.rows
    total = page.total
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { filter: query.status })
  }

  const [owners, checks] = await Promise.all([
    loadBrandPublicationOwners(event, rows.map(row => row.$id)),
    loadBrandPublicationScores(event, rows.map(row => row.checkId ?? '')),
  ])

  return {
    items: rows.map(row => toBrandPublicationAdminItem(
      row,
      owners.get(row.$id) ?? '',
      checks.get(row.checkId ?? ''),
    )),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Das ist billiger als eine zusätzliche Zähl-Abfrage je
    // Seite und für den Leser folgenlos (dieselbe Regel wie bei den Korrekturen).
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
    counts: await countBrandPublications(event),
  }
})
