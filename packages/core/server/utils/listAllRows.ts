import { AppwriteException, Query } from 'node-appwrite'
import type { Models, TablesDB } from 'node-appwrite'

const PAGE = 100
// Notanker gegen entgleisende Pagination — GDPR-Export/-Löschung MUSS
// vollständig sein, deshalb Fehler statt stillem Kappen (§4.2 im Plan).
const HARD_CAP = 50_000

/**
 * ALLE Rows einer Query per Cursor einsammeln (GDPR-Export/-Löschung:
 * Vollständigkeit ist Pflicht, `Query.limit(1000)`-Fenster sind verboten).
 * `filters` OHNE limit/cursor übergeben — beides steuert die Schleife.
 */
export async function listAllRows<T extends Models.Row>(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  for (;;) {
    const res = await tablesDB.listRows<T>({
      databaseId,
      tableId,
      queries: [...filters, Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    rows.push(...res.rows)
    if (res.rows.length < PAGE) return rows
    if (rows.length >= HARD_CAP) {
      throw new Error(`listAllRows: HARD_CAP (${HARD_CAP}) erreicht für ${tableId} — Abbruch statt unvollständigem Ergebnis`)
    }
    cursor = res.rows.at(-1)!.$id
  }
}

/**
 * Appwrites Fehler-Arten für „diese Tabelle gibt es nicht". `table_not_found`
 * ist der TablesDB-Name, `collection_not_found` der aus der Zeit der
 * Collections — ältere Instanzen und manche Pfade melden noch ihn.
 */
const TABLE_MISSING_TYPES = new Set(['table_not_found', 'collection_not_found'])

/**
 * Ist das Appwrites „Tabelle fehlt"? Nur ein `AppwriteException` mit 404 UND
 * passender Art. Ein 404 OHNE Art zählt bewusst nicht: so antwortet der
 * Proxy vor Appwrite, wenn der Dienst dahinter fehlt — das ist ein Ausfall,
 * keine ausstehende Migration. Ein 404 mit einer ANDEREN Art
 * (`database_not_found`, …) ebenso wenig: eine fehlende Datenbank ist eine
 * kaputte Instanz.
 */
export function isAppwriteTableMissing(error: unknown): boolean {
  if (!(error instanceof AppwriteException) || error.code !== 404) return false
  return TABLE_MISSING_TYPES.has(error.type)
}

/**
 * Wie `listAllRows` — mit GENAU EINER Nachsicht: fehlt die Tabelle auf dieser
 * Instanz (die Migration des Layers lief dort noch nicht), ist das eine leere
 * Liste.
 *
 * Für GDPR-Contributors gebaut (SEC-026, Teil 2). Dort stand vorher
 * `listAllRows(…).catch(() => [])`: ein 500 oder ein Netz-Wackler wurde zu
 * „dieser Mensch hat hier keine Zeilen", der Contributor meldete Erfolg, und
 * `deleteUserCompletely` löschte das Konto, während die Zeilen blieben — ohne
 * dass ein zweiter Lauf sie noch finden konnte. Ein Lesefehler ist ein
 * Fehler, kein „nichts gefunden": alles außer der fehlenden Tabelle wirft.
 */
export async function listAllRowsIfTableExists<T extends Models.Row>(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  try {
    return await listAllRows<T>(tablesDB, databaseId, tableId, filters)
  }
  catch (error) {
    if (isAppwriteTableMissing(error)) return []
    throw error
  }
}
