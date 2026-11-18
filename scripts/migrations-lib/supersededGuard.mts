/**
 * NACHFOLGER-WACHE — eine ALTE Migration legt nicht wieder an, was eine
 * spätere schon abgelöst und entfernt hat (PB1 c, 2026-11-18).
 *
 * ── WARUM ─────────────────────────────────────────────────────────────────
 * Der Runner (`scripts/migrate.mjs`) führt kein Register: ein voller Lauf
 * fährt JEDE Migration der App, jedes Mal. Eine Kette wie
 * „tenantId anlegen (N) → communityId daneben (N+k) → tenantId löschen (M)"
 * legte deshalb bei jedem vollen Lauf Spalte und Index neu an und löschte sie
 * am Ende wieder — und eine Kette, die Zeilen kopiert (control-014 Seeds →
 * control-029/030 Upsert), überschrieb dabei Bestandszeilen mit alten Werten.
 * Production fährt nur `--only`, betroffen sind neue Projekte und der lokale
 * Spiegel.
 *
 * ── DIE REGEL ─────────────────────────────────────────────────────────────
 * Steht der NACHFOLGER schon — ein Stück Schema, das ein SPÄTERER Schritt der
 * Kette anlegt und das danach BLEIBT —, hat diese Instanz die Kette hinter
 * sich: das Alte nicht wieder anlegen. Auf einer FRISCHEN Instanz gibt es den
 * Nachfolger an dieser Stelle noch nicht (er entsteht erst weiter hinten im
 * selben Lauf), dort läuft die Kette wie immer einmal durch — auch die
 * Schritte, die aus dem Alten ABLEITEN (Backfill, Index-Zwillinge, Kopie
 * einer Tabelle). Eine Instanz MITTEN in der Kette (Altes da, Nachfolger noch
 * nicht) läuft unverändert weiter.
 *
 * Gewählt wird je Stelle ein Nachfolger, der (1) NACH der anlegenden Datei
 * entsteht, (2) spätestens mit der löschenden Datei steht und (3) danach nie
 * mehr fällt. Die Begründung steht als Kommentar an jeder Wache.
 *
 * Wächter: `packages/core/tests/supersededGuards.test.ts` — jedes Paar
 * „angelegt in N, entfernt in M > N" im Quelltext braucht eine Wache mit
 * `creates` für genau diese Sache, oder einen Eintrag mit Grund in der
 * Ausnahme-Liste dort.
 *
 * Das SDK kommt vom Aufrufer und ist STRUKTURELL getippt (Begründung in
 * `runLeaseTable.mts`: `node-appwrite` ist von `scripts/` aus weder für Node
 * noch für den Compiler auflösbar). Die echte `TablesDB` erfüllt den Typ.
 */
import { hasCode } from './indexRetry.mts'

/** Was die Datei anlegen würde. Ohne `column`/`index`: die ganze Tabelle. */
export interface GuardedThing {
  table: string
  column?: string
  index?: string
}

/** Ein Stück Schema, das ein späterer Schritt der Kette anlegt und das bleibt. */
export interface SuccessorMark {
  table: string
  column?: string
  index?: string
}

export interface SupersededSdk {
  Query: { limit(limit: number): string }
}

export interface SupersededTablesDB {
  getTable(params: { databaseId: string, tableId: string }): Promise<unknown>
  listColumns(params: { databaseId: string, tableId: string, queries?: string[] }): Promise<{ columns: { key: string }[] }>
  listIndexes(params: { databaseId: string, tableId: string, queries?: string[] }): Promise<{ indexes: { key: string }[] }>
}

const describe = (thing: GuardedThing | SuccessorMark): string =>
  thing.column ? `${thing.table}.${thing.column}` : thing.index ? `${thing.table}.${thing.index}` : `Table ${thing.table}`

export function createSupersededGuard(tablesDB: SupersededTablesDB, databaseId: string, sdk: SupersededSdk) {
  async function present(mark: SuccessorMark): Promise<boolean> {
    try {
      if (mark.column) {
        // Query.limit ist PFLICHT: der Default (25) verschweigt Spalten breiter Tabellen.
        const { columns } = await tablesDB.listColumns({ databaseId, tableId: mark.table, queries: [sdk.Query.limit(200)] })
        return columns.some(column => column.key === mark.column)
      }
      if (mark.index) {
        const { indexes } = await tablesDB.listIndexes({ databaseId, tableId: mark.table, queries: [sdk.Query.limit(200)] })
        return indexes.some(index => index.key === mark.index)
      }
      await tablesDB.getTable({ databaseId, tableId: mark.table })
      return true
    }
    catch (error) {
      if (hasCode(error, 404)) return false
      throw error
    }
  }

  /**
   * `true` ⇒ ein Nachfolger steht, die Stelle NICHT anlegen (eine Zeile `↷`
   * steht dann im Protokoll). Mehrere Nachfolger: einer genügt.
   * `chain` nennt die Migrationen der Kette, nur für die Meldung.
   */
  async function superseded(creates: GuardedThing, successors: SuccessorMark | SuccessorMark[], chain: string): Promise<boolean> {
    for (const mark of Array.isArray(successors) ? successors : [successors]) {
      if (await present(mark)) {
        console.log(`↷ ${describe(creates)} (abgelöst: ${describe(mark)} steht, ${chain} — nicht wieder angelegt)`)
        return true
      }
    }
    return false
  }

  return { superseded }
}
