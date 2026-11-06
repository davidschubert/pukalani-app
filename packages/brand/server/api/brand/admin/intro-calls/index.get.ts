import { createBrandIntroListQuerySchema } from '../../../../../schemas/brandIntroCall'
import type { BrandIntroListResponse } from '../../../../../shared/types/brand'
import {
  brandIntroUnavailable,
  countBrandIntroStatuses,
  listBrandIntroRows,
  requireBrandIntroOperator,
  toBrandIntroRequestItem,
} from '../../../../utils/brandIntroCall'

/**
 * BETREIBER: DIE GESPRÄCHSANFRAGEN LESEN (`users.manage`, BS1 Z0).
 *
 * Der Plan verlangt sie ausdrücklich („Sichtbar unter /dashboard/… für den
 * Betreiber, damit keine Anfrage nur in einem Postfach lebt", §4.1 (a)) — und
 * das ist auch der Grund: die Betreiber-Mail ist der zweite Zustellweg, nicht
 * der erste, und `introCallNotify` ist per Default LEER. Ohne diese Liste
 * hinge das Bemerken einer Anfrage an einer Konfigurationszeile, die niemand
 * gesetzt haben muss.
 *
 * ── DER STANDARD-FILTER IST `new`, NICHT `all` ────────────────────────────
 * Das ist die Arbeitsliste: `new` heisst „liegt da und wartet". `contacted`
 * und `closed` sind erledigt und stehen einen Klick weiter. Default und Deckel
 * kommen aus dem Schema, damit sie an EINER Stelle stehen.
 *
 * ── DIE ZÄHLER SIND UNABHÄNGIG VOM FILTER ─────────────────────────────────
 * Sonst wäre die Kopfzeile eine Funktion der gerade gewählten Ansicht („0
 * offen", weil man `closed` anschaut) statt eine Aussage über die Liste.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `users.manage`,
 * und der Kreis dieser Sessions ist der Betreiber selbst. Die IP-Eimer in
 * `05.rate-limit.ts` sind für die ÖFFENTLICHEN Wege da.
 */
export default defineEventHandler(async (event): Promise<BrandIntroListResponse> => {
  requireBrandIntroOperator(event)

  const query = await getValidatedQuery(event, createBrandIntroListQuerySchema().parse)

  let rows
  let total: number
  try {
    const page = await listBrandIntroRows(event, {
      filter: query.status,
      limit: query.limit,
      cursor: query.cursor,
    })
    rows = page.rows
    total = page.total
  }
  catch (error) {
    throw brandIntroUnavailable(error, { filter: query.status })
  }

  return {
    items: rows.map(toBrandIntroRequestItem),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Das ist billiger als eine zusätzliche Zähl-Abfrage je
    // Seite und für den Leser folgenlos.
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
    counts: await countBrandIntroStatuses(event),
  }
})
