import { createBrandWaitlistListQuerySchema } from '../../../../../schemas/brandWaitlist'
import type { BrandWaitlistAdminListResponse } from '../../../../../shared/types/brand'
import {
  brandWaitlistUnavailable,
  countBrandWaitlistStatuses,
  listBrandWaitlistRows,
  requireBrandWaitlistOperator,
  toBrandWaitlistAdminItem,
} from '../../../../utils/brandWaitlistAdmin'

/**
 * BETREIBER: DIE WARTELISTE LESEN (`users.manage`).
 *
 * Bis heute stand `brand_waitlist` nur in der Appwrite-Konsole — eine
 * Warteliste, die niemand liest, ist keine (Davids Entscheidung 2026-09-05:
 * ein Modul wie „Anfragen"/„Einladungen" im Control Plane).
 *
 * ── DER STANDARD-FILTER IST `confirmed`, NICHT `all` ──────────────────────
 * Das ist die Arbeitsliste: bestätigt heißt, ein Mensch hat den Link in SEINEM
 * Postfach geöffnet und wartet auf eine Entscheidung. `pending` gehört
 * niemandem, `invited`/`declined` sind erledigt. Der Filter kommt aus dem
 * Schema (`createBrandWaitlistListQuerySchema`), damit Default und Deckel an
 * EINER Stelle stehen.
 *
 * ── DIE ZÄHLER SIND UNABHÄNGIG VOM FILTER ─────────────────────────────────
 * Sonst wäre die Kopfzeile eine Funktion der gerade gewählten Ansicht („0
 * wartend", weil man `invited` anschaut) statt eine Aussage über die Liste.
 *
 * ── WAS NICHT RAUSGEHT ────────────────────────────────────────────────────
 * `tokenHash` und `tokenExpiresAt`. Die Auslassung ist in
 * `toBrandWaitlistAdminItem` eingebaut, nicht hier von Hand — eine Route, die
 * ihre Felder selbst aufzählt, vergisst irgendwann eine.
 *
 * KEINE eigene Drossel: die Route ist an eine Session MIT `users.manage`
 * gebunden, und der Kreis dieser Sessions ist der Betreiber selbst. Die
 * IP-Eimer in `05.rate-limit.ts` sind für die ÖFFENTLICHEN Wege da (der
 * `brand:waitlist`-Eimer deckt Eintragen und Bestätigen ab).
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistAdminListResponse> => {
  requireBrandWaitlistOperator(event)

  const query = await getValidatedQuery(event, createBrandWaitlistListQuerySchema().parse)

  let rows
  let total: number
  try {
    const page = await listBrandWaitlistRows(event, {
      filter: query.status,
      limit: query.limit,
      cursor: query.cursor,
    })
    rows = page.rows
    total = page.total
  }
  catch (error) {
    throw brandWaitlistUnavailable(error, { filter: query.status })
  }

  return {
    items: rows.map(toBrandWaitlistAdminItem),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Das ist billiger als eine zusätzliche Zähl-Abfrage je
    // Seite und für den Leser folgenlos.
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
    counts: await countBrandWaitlistStatuses(event),
  }
})
