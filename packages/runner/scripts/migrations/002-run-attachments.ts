/**
 * Migration runner-002: `runs.attachmentsJson`.
 * Konzept: docs/plans/AI-RUNNER.md § 4/§ 6.
 *
 * EINE Spalte, additiv. Sie trägt die KOPIE der Anhänge eines Laufs
 * (`RunAttachment[]` als JSON) — die Dateien selbst liegen im Bucket
 * `runner-files` aus `runner-001`, ausdrücklich NICHT im `ticket-files`-Bucket
 * eines fremden Produkts: `runner` kennt `tickets` nicht (A14), und der Runner
 * hat für dessen Session-Routen keinen Passierschein.
 *
 * WARUM EINE SPALTE UND KEINE TABELLE: ein Lauf ist ein VERSIEGELTER Auftrag.
 * Nach der Freigabe (`runs/:id/queue`) ändert sich die Liste nie wieder, es
 * gibt keine Abfrage „alle Anhänge über alle Läufe", und der Deckel liegt bei
 * zehn Einträgen. Eine zweite Tabelle wäre ein Join für Daten, die immer
 * zusammen gelesen werden.
 *
 * 4000 Zeichen sind der Rahmen, nicht die Regel: der Deckel steht als
 * `MAX_RUN_ATTACHMENTS` im Code (10). Die Spalte ist VARCHAR und nicht
 * MEDIUMTEXT, weil sie ins ~65-KB-Zeilenbudget von MariaDB passen muss —
 * `runs` hat mit `resultJson` (6000) und `error` (2000) schon zwei große
 * Nachbarn, und der wirklich große Text (`promptSource`) liegt bewusst
 * off-row.
 *
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app control --layer runner
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
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
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration runner-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const runCols = await existingColumnKeys('runs')
await columnStep('Column runs.attachmentsJson', 'attachmentsJson', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'attachmentsJson', size: 4000, required: false, xdefault: '',
}))

// KEIN Index: die Spalte wird nie gefiltert, sondern immer zusammen mit ihrem
// Lauf gelesen. Ein Index darauf wäre Schreiblast ohne Leser.
await waitForColumns('runs')

console.log('✔ Migration runner-002 fertig')
