import { createBrandCheckCorrectionListQuerySchema } from '../../../../../schemas/brandCheck'
import type { BrandCheckCorrectionListResponse } from '../../../../../shared/types/brand'
import {
  brandCheckAdminUnavailable,
  countBrandCheckCorrections,
  listBrandCheckCorrectionRows,
  loadBrandCheckSummaries,
  requireBrandCheckOperator,
  toBrandCheckCorrection,
} from '../../../../utils/brandCheckAdmin'

/**
 * BETREIBER: DIE KORREKTURVORSCHLÄGE LESEN (`users.manage`, Plan §3b).
 *
 * ── DER STANDARD-FILTER IST `open` ────────────────────────────────────────
 * Das ist die Arbeitsliste. `accepted` und `declined` sind erledigt und
 * bleiben stehen, damit dieselbe Sache nicht ein zweites Mal entschieden wird
 * (dieselbe Entscheidung wie beim Ablehnen einer Warteliste-Zeile).
 *
 * ── DER IST-WERT REIST MIT, IN EINER ABFRAGE ──────────────────────────────
 * Ein Vorschlag ohne den heutigen Wert ist nicht entscheidbar: „schlägt
 * `agency` vor" sagt nichts, solange dort vielleicht schon `agency` steht.
 * Geholt wird er gebündelt (`loadBrandCheckSummaries`) — eine Liste mit fünfzig
 * Zeilen darf nicht fünfzig Fragen stellen.
 *
 * ── DIE ZÄHLER SIND UNABHÄNGIG VOM FILTER ─────────────────────────────────
 * Sonst wäre die Kopfzeile eine Funktion der gerade gewählten Ansicht („0
 * offen", weil man die abgelehnten anschaut) statt eine Aussage über die Liste.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `users.manage`,
 * und der Kreis dieser Sessions ist der Betreiber selbst. Die IP-Eimer in
 * `05.rate-limit.ts` sind für die ÖFFENTLICHEN Wege da.
 */
export default defineEventHandler(async (event): Promise<BrandCheckCorrectionListResponse> => {
  requireBrandCheckOperator(event)

  const query = await getValidatedQuery(event, createBrandCheckCorrectionListQuerySchema().parse)

  let rows
  let total: number
  try {
    const page = await listBrandCheckCorrectionRows(event, {
      filter: query.status,
      limit: query.limit,
      cursor: query.cursor,
    })
    rows = page.rows
    total = page.total
  }
  catch (error) {
    throw brandCheckAdminUnavailable(error, { filter: query.status })
  }

  const checks = await loadBrandCheckSummaries(event, rows.map(row => row.checkId))

  return {
    items: rows.map(row => toBrandCheckCorrection(row, checks.get(row.checkId))),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Das ist billiger als eine zusätzliche Zähl-Abfrage je
    // Seite und für den Leser folgenlos (dieselbe Regel wie in der Warteliste).
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
    counts: await countBrandCheckCorrections(event),
  }
})
