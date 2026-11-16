import { AppwriteException } from 'node-appwrite'

/**
 * EINE ABLAGE FÜR RENN-TESTS (BE-013).
 *
 * Wie Appwrite in den drei Eigenschaften, an denen die Regeln des Control
 * Plane hängen — und in keiner weiteren:
 *
 *  1. JEDER AUFRUF GIBT DIE HAND AB, bevor er liest oder schreibt
 *     (`setImmediate`). Zwei gleichzeitige Anfragen verschränken sich damit
 *     wie über das Netz: beide lesen, bevor eine schreibt. Ohne das liefe ein
 *     `Promise.all` praktisch nacheinander, und ein Test bewiese nichts.
 *  2. `createRow` mit einer vorhandenen Id antwortet 409 (die Lauf-Sperre
 *     hängt daran) — geprüft und geschrieben OHNE Unterbrechung dazwischen.
 *  3. `incrementRowColumn`/`decrementRowColumn` sind atomar und halten
 *     `max`/`min` (400 `column_limit_exceeded`, wie lokal gegen 2.7.1
 *     gemessen).
 *
 * Abfragen werden wirklich ausgewertet (equal, greaterThan, orderAsc/Desc,
 * limit, offset, cursorAfter), sonst bewiese ein Zähl-Test nichts.
 *
 * Eine Tabelle in `missingTables` antwortet wie eine nicht gefahrene Migration
 * (404 `table_not_found`) — für Code, der vor seiner Migration live gehen darf.
 */

export interface RaceRow { $id: string, $createdAt: string, [key: string]: unknown }

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const handOff = () => new Promise<void>(resolve => setImmediate(resolve))

export function createRaceTablesDB() {
  const tables = new Map<string, Map<string, RaceRow>>()
  /** Zeilen-Ids, deren Schreiben scheitern soll (z. B. der zweite Schritt einer Übergabe). */
  const failingUpdates = new Map<string, (data: Record<string, unknown>) => boolean>()
  /** Tabellen, deren Lesen scheitern soll (z. B. die Sperre). */
  const failingReads = new Map<string, () => Error>()
  /** Tabellen, die es (noch) nicht gibt. */
  const missingTables = new Set<string>()
  let clock = 0

  function assertTable(tableId: string) {
    if (missingTables.has(tableId)) throw new AppwriteException('Table not found', 404, 'table_not_found')
  }

  function table(id: string): Map<string, RaceRow> {
    let found = tables.get(id)
    if (!found) {
      found = new Map()
      tables.set(id, found)
    }
    return found
  }

  function stamp(): string {
    clock++
    return new Date(Date.now() - 60_000 + clock).toISOString()
  }

  function seed(tableId: string, data: Record<string, unknown> & { $id: string }): RaceRow {
    const row: RaceRow = { $createdAt: stamp(), ...data }
    table(tableId).set(row.$id, row)
    return row
  }

  function notFound(): AppwriteException {
    return new AppwriteException('Row not found', 404, 'row_not_found')
  }

  function compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a ?? '').localeCompare(String(b ?? ''))
  }

  const tablesDB = {
    async listRows({ tableId, queries = [] }: { databaseId?: string, tableId: string, queries?: string[] }) {
      await handOff()
      assertTable(tableId)
      const failure = failingReads.get(tableId)
      if (failure) throw failure()
      const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
      let rows = [...table(tableId).values()]
      for (const query of parsed) {
        const key = query.attribute ?? ''
        if (query.method === 'equal') rows = rows.filter(row => (query.values ?? []).includes(row[key]))
        if (query.method === 'greaterThan') rows = rows.filter(row => compare(row[key], query.values?.[0]) > 0)
      }
      const order = parsed.find(query => query.method === 'orderAsc' || query.method === 'orderDesc')
      rows.sort((a, b) => compare(a.$createdAt, b.$createdAt))
      if (order) {
        rows.sort((a, b) => compare(a[order.attribute ?? ''], b[order.attribute ?? '']))
        if (order.method === 'orderDesc') rows.reverse()
      }
      const total = rows.length
      const cursor = parsed.find(query => query.method === 'cursorAfter')
      if (cursor) rows = rows.slice(rows.findIndex(row => row.$id === cursor.values?.[0]) + 1)
      const offset = parsed.find(query => query.method === 'offset')
      if (offset) rows = rows.slice(Number(offset.values?.[0] ?? 0))
      const limit = parsed.find(query => query.method === 'limit')
      rows = rows.slice(0, Number(limit?.values?.[0] ?? 25))
      return { rows: rows.map(row => ({ ...row })), total }
    },
    async getRow({ tableId, rowId }: { databaseId?: string, tableId: string, rowId: string }) {
      await handOff()
      assertTable(tableId)
      const failure = failingReads.get(tableId)
      if (failure) throw failure()
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      return { ...row }
    },
    async createRow({ tableId, rowId, data }: { databaseId?: string, tableId: string, rowId: string, data: Record<string, unknown>, permissions?: string[] }) {
      await handOff()
      assertTable(tableId)
      const id = rowId === 'unique()' ? `row-${++clock}` : rowId
      if (table(tableId).has(id)) throw new AppwriteException('Document with the requested ID already exists.', 409, 'row_already_exists')
      return { ...seed(tableId, { ...data, $id: id }) }
    },
    async updateRow({ tableId, rowId, data }: { databaseId?: string, tableId: string, rowId: string, data: Record<string, unknown> }) {
      await handOff()
      const fails = failingUpdates.get(rowId)
      if (fails?.(data)) throw new AppwriteException('Server Error', 500, 'general_unknown')
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      Object.assign(row, data)
      return { ...row }
    },
    async deleteRow({ tableId, rowId }: { databaseId?: string, tableId: string, rowId: string }) {
      await handOff()
      assertTable(tableId)
      if (!table(tableId).delete(rowId)) throw notFound()
      return {}
    },
    async incrementRowColumn({ tableId, rowId, column, value = 1, max }: { databaseId?: string, tableId: string, rowId: string, column: string, value?: number, max?: number | null }) {
      await handOff()
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      const next = Number(row[column] ?? 0) + value
      if (typeof max === 'number' && next > max) {
        throw new AppwriteException('Value exceeds the maximum.', 400, 'column_limit_exceeded')
      }
      row[column] = next
      return { ...row }
    },
    async decrementRowColumn({ tableId, rowId, column, value = 1, min }: { databaseId?: string, tableId: string, rowId: string, column: string, value?: number, min?: number | null }) {
      await handOff()
      const row = table(tableId).get(rowId)
      if (!row) throw notFound()
      const next = Number(row[column] ?? 0) - value
      if (typeof min === 'number' && next < min) {
        throw new AppwriteException('Value below the minimum.', 400, 'column_limit_exceeded')
      }
      row[column] = next
      return { ...row }
    },
  }

  return {
    tablesDB,
    table,
    seed,
    failingUpdates,
    failingReads,
    missingTables,
    reset() {
      tables.clear()
      failingUpdates.clear()
      failingReads.clear()
      missingTables.clear()
      clock = 0
    },
  }
}
