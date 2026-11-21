/**
 * DIE LAUF-TABELLE — EINE Fabrik für jede Migration, die eine Tabelle der
 * Lauf-Sperre anlegt (GA1 P18; heute market-005 `market_runs` und
 * insights-012 `insights_runs`).
 *
 * Warum es die Tabelle gibt und warum jeder Lauf eine EIGENE Zeile mit
 * deterministischer Id ist: Kopf von `packages/core/shared/runLease.ts`. Hier
 * steht nur das Schema — und es steht EINMAL, weil der Server-Teil
 * (`packages/core/server/utils/runLease.ts`) für jede Lauf-Tabelle dieselben
 * Spalten erwartet. Zwei abgeschriebene Migrationen würden beim ersten
 * Nachtrag auseinanderlaufen.
 *
 * ── DAS SCHEMA ──────────────────────────────────────────────────────────
 *  scope        varchar 32,   Pflicht — die Art des Laufs (`run`, `newsletter`)
 *  subject      varchar 64,   Pflicht — woran er hängt (Profil-Id, Sende-Zeile)
 *  seq          integer ≥ 1,  Pflicht — fortlaufend je (scope, subject)
 *  startedAt    datetime,     Pflicht
 *  heartbeatAt  datetime,     Pflicht — der Herzschlag, aus dem der Zustand
 *                                       gerechnet wird
 *  finishedAt   datetime,     optional — gesetzt ⇒ `done` oder `failed`
 *  outcome      varchar 32,   optional — `done` oder ein kurzer Fehler-Code
 *  detail       varchar 4000, optional — kleines JSON (Zählerstände)
 * KEINE Spalte `state`: der Zustand wird gerechnet, nie gespeichert.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ─────────────────────────────────────
 * varchar-Summe 32 + 64 + 32 + 4000 = 4.128 Zeichen — weit unter der Grenze
 * von 16.381 Zeichen (65.535 Byte / 4 Byte je Zeichen, abzüglich Verwaltung).
 * `detail` bleibt bewusst varchar statt MEDIUMTEXT: es ist klein, und
 * `clampRunLeaseDetail` schreibt lieber nichts als zu viel.
 *
 * ── DER EINE INDEX ──────────────────────────────────────────────────────
 * `idx_scope_subject_seq` (key) trägt die einzige Abfrage des Servers:
 * „jüngste Zeile je (scope, subject)" = `equal scope`, `equal subject`,
 * `orderDesc seq`, `limit 1`. Bewusst KEIN unique-Index: die Eindeutigkeit
 * kommt aus der Zeilen-Id (createRow mit fester Id ⇒ 409), ein zweiter
 * Riegel daneben wäre eine zweite Wahrheit, die nur stören kann.
 *
 * Server-only: `permissions: []`, `rowSecurity: false` — gelesen und
 * geschrieben wird nur mit dem Admin-Client.
 *
 * Idempotent: vorhandene Tabelle (409) und vorhandene Spalten werden
 * übersprungen, Indizes nur über `createIndexSteps` (Retry + Cache-Anstoß,
 * `.claude/rules/appwrite-migrationen.md`). Zerstört nichts.
 */
import { createIndexSteps, hasCode, type IndexingTablesDB } from './indexRetry.mts'

/**
 * DAS SDK KOMMT VOM AUFRUFER, NICHT AUS EINEM IMPORT. Node löst `node-appwrite`
 * relativ zur IMPORTIERENDEN Datei auf, und unter `scripts/` liegt das Paket
 * nicht (es hängt in den `node_modules` der Layer). Ein Laufzeit-Import hier
 * scheiterte also mit ERR_MODULE_NOT_FOUND — `indexRetry.mts` meidet ihn aus
 * demselben Grund.
 *
 * AUCH DIE TYPEN KOMMEN NICHT AUS DEM PAKET (seit system-040, 2026-11-16): der
 * `system`-Layer liegt als Ganzes im Typ-Programm der Apps, seine Migrationen
 * werden also mitgeprüft — und von `scripts/` aus ist `node-appwrite` auch
 * für den Compiler nicht auflösbar (TS2307). Deshalb STRUKTURELL getippt, wie
 * `indexRetry.mts`: nur die Aufrufe, die diese Fabrik wirklich macht. Die
 * echte `TablesDB` erfüllt sie.
 */
export interface RunLeaseTableSdk {
  Query: { limit: (limit: number) => string }
  TablesDBIndexType: { Key: string }
}

interface ColumnParams { databaseId: string, tableId: string, key: string, required: boolean }

export interface RunLeaseTablesDB extends IndexingTablesDB {
  listColumns: (params: { databaseId: string, tableId: string, queries?: string[] }) => Promise<{ columns: { key: string, status: string }[] }>
  createTable: (params: { databaseId: string, tableId: string, name: string, permissions?: string[], rowSecurity?: boolean }) => Promise<unknown>
  createVarcharColumn: (params: ColumnParams & { size: number }) => Promise<unknown>
  createIntegerColumn: (params: ColumnParams & { min?: number }) => Promise<unknown>
  createDatetimeColumn: (params: ColumnParams) => Promise<unknown>
}

async function step(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

export async function ensureRunLeaseTable(input: {
  tablesDB: RunLeaseTablesDB
  databaseId: string
  tableId: string
  name: string
  sdk: RunLeaseTableSdk
}): Promise<void> {
  const { tablesDB, databaseId, tableId, name } = input
  const { Query, TablesDBIndexType } = input.sdk
  const { indexStep } = createIndexSteps(tablesDB, databaseId)

  /** Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert listColumns 25. */
  async function existingColumnKeys(): Promise<Set<string>> {
    try {
      const { columns } = await tablesDB.listColumns({ databaseId, tableId, queries: [Query.limit(200)] })
      return new Set(columns.map(column => column.key))
    }
    catch (error) {
      if (hasCode(error, 404)) return new Set()
      throw error
    }
  }

  async function waitForColumns(): Promise<void> {
    for (let i = 0; i < 300; i++) {
      const { columns } = await tablesDB.listColumns({ databaseId, tableId, queries: [Query.limit(200)] })
      if (columns.length > 0 && columns.every(column => column.status === 'available')) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
  }

  await step(`Table ${tableId}`, () => tablesDB.createTable({
    databaseId, tableId, name, permissions: [], rowSecurity: false,
  }))

  const cols = await existingColumnKeys()
  const column = async (key: string, run: () => Promise<unknown>) => {
    if (cols.has(key)) {
      console.log(`↷ Column ${tableId}.${key} (existiert bereits)`)
      return
    }
    await step(`Column ${tableId}.${key}`, run)
  }

  await column('scope', () => tablesDB.createVarcharColumn({
    databaseId, tableId, key: 'scope', size: 32, required: true,
  }))
  await column('subject', () => tablesDB.createVarcharColumn({
    databaseId, tableId, key: 'subject', size: 64, required: true,
  }))
  await column('seq', () => tablesDB.createIntegerColumn({
    databaseId, tableId, key: 'seq', required: true, min: 1,
  }))
  await column('startedAt', () => tablesDB.createDatetimeColumn({
    databaseId, tableId, key: 'startedAt', required: true,
  }))
  await column('heartbeatAt', () => tablesDB.createDatetimeColumn({
    databaseId, tableId, key: 'heartbeatAt', required: true,
  }))
  await column('finishedAt', () => tablesDB.createDatetimeColumn({
    databaseId, tableId, key: 'finishedAt', required: false,
  }))
  await column('outcome', () => tablesDB.createVarcharColumn({
    databaseId, tableId, key: 'outcome', size: 32, required: false,
  }))
  await column('detail', () => tablesDB.createVarcharColumn({
    databaseId, tableId, key: 'detail', size: 4000, required: false,
  }))

  await waitForColumns()

  await indexStep(`Index ${tableId}.idx_scope_subject_seq`, {
    tableId, key: 'idx_scope_subject_seq', type: TablesDBIndexType.Key, columns: ['scope', 'subject', 'seq'],
  })
}
