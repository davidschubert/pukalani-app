import { createBrandWaitlistListQuerySchema } from '../../../../../schemas/brandWaitlist'
import type { BrandWaitlistAdminItem } from '../../../../../shared/types/brand'
import {
  brandWaitlistUnavailable,
  listBrandWaitlistRows,
  requireBrandWaitlistOperator,
  toBrandWaitlistAdminItem,
} from '../../../../utils/brandWaitlistAdmin'

/**
 * BETREIBER: DIE WARTELISTE ALS CSV (`users.manage`).
 *
 * Gleiche Auswahl wie die Liste (`?status=`), nur vollständig statt seitenweise
 * — dafür läuft der Export über den Cursor, bis nichts mehr kommt.
 *
 * ── EXCEL-DEUTSCH: SEMIKOLON, BOM, CRLF ───────────────────────────────────
 * Ein deutsches Excel liest ein KOMMA nicht als Trenner (dort ist es das
 * Dezimalzeichen) und stellt eine ganze Zeile in eine Zelle. Der BOM ist die
 * zweite Hälfte derselben Sache: ohne ihn erkennt Excel UTF-8 nicht und macht
 * aus „Müller" „MÃ¼ller". Beides ist im User-Export des admin-Layers schon so
 * gelöst (`admin/users/export-csv.get.ts`) — dort mit Komma, weil der Export
 * dieses Repos an einer anderen Stelle entstand; hier ist die Zielgruppe
 * ausdrücklich das deutsche Tabellenprogramm.
 *
 * ── DER FORMEL-SCHUTZ IST KEINE KOSMETIK ──────────────────────────────────
 * Excel und Sheets führen eine Zelle aus, die mit `= + - @` beginnt. In diesen
 * Zeilen steht FREMDE Eingabe (Name, Firma, Website aus einem öffentlichen
 * Formular) — ohne das vorangestellte `'` wäre der Export ein Weg, dem
 * Betreiber eine Formel unterzuschieben. Zusätzlich fliegen CR/LF aus den
 * Zellen: ein Zeilenumbruch im Namen zerlegte sonst die Zeile.
 *
 * ── DIE KOPFZEILE TRÄGT FELD-NAMEN, KEINE ÜBERSCHRIFTEN ───────────────────
 * `email;name;company;…` — dieselben Namen wie in `BrandWaitlistAdminItem`.
 * Eine übersetzte Kopfzeile sähe im Tabellenprogramm hübscher aus, aber die
 * Datei wird weiterverarbeitet, und eine Spaltenbeschriftung, die sich mit der
 * Oberflächen-Sprache ändert, bricht jede Weiterverarbeitung.
 *
 * `tokenHash` steht auch hier nicht drin: der Export geht durch dieselbe
 * `toBrandWaitlistAdminItem`-Naht wie die Liste.
 */

const PAGE = 100
/** Notbremse gegen eine Antwort, die niemand mehr öffnet. */
const HARD_CAP = 20_000

const COLUMNS = [
  'id', 'email', 'name', 'company', 'website',
  'locale', 'source', 'status', 'note', 'createdAt', 'confirmedAt',
] as const satisfies readonly (keyof BrandWaitlistAdminItem)[]

function csvCell(value: string): string {
  // Formel-Injection (Excel/Sheets führt führende = + - @ aus)
  let cell = /^[=+\-@]/.test(value) ? `'${value}` : value
  // Zeilenumbrüche aus fremder Eingabe zerlegten sonst die Zeile
  cell = cell.replace(/[\r\n]+/g, ' ')
  return `"${cell.replace(/"/g, '""')}"`
}

export default defineEventHandler(async (event): Promise<string> => {
  requireBrandWaitlistOperator(event)

  const query = await getValidatedQuery(event, createBrandWaitlistListQuerySchema().parse)

  const lines = [COLUMNS.join(';')]
  let cursor = ''

  for (;;) {
    let rows
    try {
      const page = await listBrandWaitlistRows(event, {
        filter: query.status,
        limit: PAGE,
        cursor,
      })
      rows = page.rows
    }
    catch (error) {
      throw brandWaitlistUnavailable(error, { filter: query.status, stage: 'export' })
    }

    for (const row of rows) {
      const item = toBrandWaitlistAdminItem(row)
      lines.push(COLUMNS.map(column => csvCell(item[column])).join(';'))
    }

    if (rows.length < PAGE) break
    if (lines.length > HARD_CAP) {
      logEvent('warn', 'brand.waitlist_export_capped', { cap: HARD_CAP })
      break
    }
    cursor = rows.at(-1)?.$id ?? ''
    if (!cursor) break
  }

  logEvent('info', 'brand.waitlist_exported', { filter: query.status, count: lines.length - 1 })

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="warteliste-${new Date().toISOString().slice(0, 10)}.csv"`,
  )
  // BOM: ohne ihn erkennt Excel UTF-8 nicht (s. Kopf)
  return `\uFEFF${lines.join('\r\n')}\r\n`
})
