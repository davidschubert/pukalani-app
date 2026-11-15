/**
 * Migration runner-001: runners + runs + run_events (+ Bucket `runner-files`).
 * Konzept: docs/plans/AI-RUNNER.md § 4.
 *
 * rowSecurity = false; Table-Read NUR für label:admin — bewusst ENGER als bei
 * `tickets`, wo admin UND moderator lesen. Ein Lauf trägt Repo-Schlüssel,
 * Branch-Namen und Kostendaten von Davids Rechner; das ist keine
 * Moderations-Sache. Entsprechend hängt `runner.manage` in core/shared/authz.ts
 * nur in der Admin-Rolle. Der Table-Read ist zugleich die Voraussetzung dafür,
 * dass die geteilte JWT-SDK-Realtime die Ereigniszeilen live ins Board liefert.
 *
 * Geschrieben wird AUSSCHLIESSLICH über Server-Routen mit dem Admin-Client —
 * vom Board (Session + `runner.manage`) oder vom Runner (Bearer-Secret, § 5).
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app control --layer runner
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Permission, Role, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
const { indexStep } = createIndexSteps(tablesDB, databaseId)
const storage = new Storage(client)

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
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
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

console.log(`Migration runner-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

/**
 * NUR admin (§ 4) — `moderator` fehlt hier ABSICHTLICH. Wer diese Zeile
 * „vervollständigt", öffnet Moderatoren die Repo-Schlüssel, Branch-Namen und
 * Kosten eines fremden Rechners.
 */
const ADMIN_READ = [Permission.read(Role.label('admin'))]

// --- runners ---------------------------------------------------------------
await step('Table runners', () => tablesDB.createTable({
  databaseId, tableId: 'runners', name: 'Runners',
  permissions: ADMIN_READ, rowSecurity: false,
}))
const runnerCols = await existingColumnKeys('runners')
await columnStep('Column runners.name', 'name', runnerCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runners', key: 'name', size: 120, required: true,
}))
await columnStep('Column runners.kind', 'kind', runnerCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runners', key: 'kind', size: 8, required: false, xdefault: 'local',
}))
// HASH, nie der Klartext (M9-Muster wie community_invites.tokenHash) — 64
// Zeichen reichen für einen Hex-SHA-256.
await columnStep('Column runners.secretHash', 'secretHash', runnerCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runners', key: 'secretHash', size: 64, required: true,
}))
// Was der Runner MELDET — Anzeige-Kopie, keine Wahrheit (§ 8.1: die Allowlist
// liegt lokal auf dem Rechner). Großzügig, weil dort Repos, Modelle und Modi
// als JSON stehen.
await columnStep('Column runners.capabilitiesJson', 'capabilitiesJson', runnerCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runners', key: 'capabilitiesJson', size: 4000, required: false, xdefault: '',
}))
await columnStep('Column runners.lastSeenAt', 'lastSeenAt', runnerCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'runners', key: 'lastSeenAt', required: false,
}))
await columnStep('Column runners.status', 'status', runnerCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runners', key: 'status', size: 12, required: false, xdefault: 'active',
}))

// --- runs ------------------------------------------------------------------
await step('Table runs', () => tablesDB.createTable({
  databaseId, tableId: 'runs', name: 'Runs',
  permissions: ADMIN_READ, rowSecurity: false,
}))
const runCols = await existingColumnKeys('runs')
// NEUTRALER Bezug statt ticketId (§ 3.1) — heute nur 'ticket'.
await columnStep('Column runs.subjectType', 'subjectType', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'subjectType', size: 24, required: true,
}))
await columnStep('Column runs.subjectId', 'subjectId', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'subjectId', size: 36, required: true,
}))
await columnStep('Column runs.runnerId', 'runnerId', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'runnerId', size: 36, required: false, xdefault: '',
}))
await columnStep('Column runs.executor', 'executor', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'executor', size: 24, required: false, xdefault: 'claude-code',
}))
await columnStep('Column runs.status', 'status', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'status', size: 12, required: true,
}))
// SCHLÜSSEL aus der Runner-Allowlist, NIE ein Pfad (§ 8.1).
await columnStep('Column runs.repoKey', 'repoKey', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'repoKey', size: 64, required: true,
}))
await columnStep('Column runs.baseBranch', 'baseBranch', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'baseBranch', size: 255, required: false, xdefault: '',
}))
await columnStep('Column runs.workBranch', 'workBranch', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'workBranch', size: 255, required: false, xdefault: '',
}))
await columnStep('Column runs.model', 'model', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'model', size: 64, required: false, xdefault: '',
}))
await columnStep('Column runs.permissionMode', 'permissionMode', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'permissionMode', size: 24, required: false, xdefault: 'plan',
}))
await columnStep('Column runs.interactive', 'interactive', runCols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'runs', key: 'interactive', required: false, xdefault: false,
}))
// MEDIUMTEXT (off-row, zählt NICHT ins ~65-KB-Zeilenbudget von MariaDB):
// Beschreibung + Checkliste + zitiertes Feedback sprengen ein VARCHAR sonst
// bei der ersten großen Karte (Lektion pages-002). MariaDB erlaubt für
// TEXT-Spalten je nach Setup keinen Default — deshalb der zweite Versuch
// ohne, genau wie in pages-001.
await columnStep('Column runs.promptSource', 'promptSource', runCols, async () => {
  try {
    await tablesDB.createMediumtextColumn({ databaseId, tableId: 'runs', key: 'promptSource', required: false, xdefault: '' })
  }
  catch {
    await tablesDB.createMediumtextColumn({ databaseId, tableId: 'runs', key: 'promptSource', required: false })
  }
})
// FAIL-CLOSED: Default false heißt „ungeprüfte Herkunft" (§ 8.2). Ein Lauf,
// bei dem das Setzen vergessen wird, ist damit der VORSICHTIGE Fall.
await columnStep('Column runs.promptTrusted', 'promptTrusted', runCols, () => tablesDB.createBooleanColumn({
  databaseId, tableId: 'runs', key: 'promptTrusted', required: false, xdefault: false,
}))
await columnStep('Column runs.testCommands', 'testCommands', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'testCommands', size: 1000, required: false, xdefault: '',
}))
// 0 = kein eigener Deckel; der Runner kappt ohnehin gegen seinen (§ 7.2).
await columnStep('Column runs.maxBudgetUsd', 'maxBudgetUsd', runCols, () => tablesDB.createFloatColumn({
  databaseId, tableId: 'runs', key: 'maxBudgetUsd', required: false, xdefault: 0,
}))
await columnStep('Column runs.sessionId', 'sessionId', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'sessionId', size: 36, required: false, xdefault: '',
}))
await columnStep('Column runs.claimedAt', 'claimedAt', runCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'runs', key: 'claimedAt', required: false,
}))
await columnStep('Column runs.startedAt', 'startedAt', runCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'runs', key: 'startedAt', required: false,
}))
await columnStep('Column runs.finishedAt', 'finishedAt', runCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'runs', key: 'finishedAt', required: false,
}))
// Abschlussbericht als JSON (Commit, Diffstat, Tests, Kosten, Dauer).
// Großzügig, aber nicht grenzenlos: das Zeilenbudget teilen sich hier alle
// VARCHARs — das volle Transkript geht als DATEI in den Bucket, nicht hierhin.
await columnStep('Column runs.resultJson', 'resultJson', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'resultJson', size: 6000, required: false, xdefault: '',
}))
await columnStep('Column runs.error', 'error', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'error', size: 2000, required: false, xdefault: '',
}))
await columnStep('Column runs.createdBy', 'createdBy', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'createdBy', size: 36, required: false, xdefault: '',
}))

// --- run_events ------------------------------------------------------------
await step('Table run_events', () => tablesDB.createTable({
  databaseId, tableId: 'run_events', name: 'Run Events',
  permissions: ADMIN_READ, rowSecurity: false,
}))
const eventCols = await existingColumnKeys('run_events')
await columnStep('Column run_events.runId', 'runId', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'run_events', key: 'runId', size: 36, required: true,
}))
// Monoton je Lauf — der Runner zählt; die Anzeige sortiert danach, nicht nach
// $createdAt (Ereignisse kommen GEBÜNDELT an, § 7.2 Schritt 6).
await columnStep('Column run_events.seq', 'seq', eventCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: 'run_events', key: 'seq', required: false, min: 0, max: 1_000_000, xdefault: 0,
}))
await columnStep('Column run_events.kind', 'kind', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'run_events', key: 'kind', size: 8, required: true,
}))
await columnStep('Column run_events.message', 'message', eventCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'run_events', key: 'message', size: 4000, required: false, xdefault: '',
}))
await columnStep('Column run_events.at', 'at', eventCols, () => tablesDB.createDatetimeColumn({
  databaseId, tableId: 'run_events', key: 'at', required: false,
}))

await waitForColumns('runners')
await waitForColumns('runs')
await waitForColumns('run_events')

// Indizes NUR über die Fabrik (Retry + Cache-Anstoß) — rohes createIndex
// verbietet ESLint in packages/*/scripts/migrations/**.
await indexStep('Index runs.idx_status', {
  tableId: 'runs', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
})
await indexStep('Index runs.idx_subject', {
  tableId: 'runs', key: 'idx_subject', type: TablesDBIndexType.Key, columns: ['subjectType', 'subjectId'],
})
await indexStep('Index runs.idx_runner', {
  tableId: 'runs', key: 'idx_runner', type: TablesDBIndexType.Key, columns: ['runnerId'],
})
await indexStep('Index run_events.idx_run', {
  tableId: 'run_events', key: 'idx_run', type: TablesDBIndexType.Key, columns: ['runId'],
})
await indexStep('Index run_events.idx_run_seq', {
  tableId: 'run_events', key: 'idx_run_seq', type: TablesDBIndexType.Key, columns: ['runId', 'seq'],
})

// --- Bucket runner-files ---------------------------------------------------
// EIGENER Bucket (§ 4), NICHT `ticket-files`: dessen Upload-Route verlangt
// Session + `tickets.manage`, der Runner hat nur sein Bearer-Secret — und
// `runner` kennt `tickets` nicht (A14). Keine öffentlichen Permissions:
// Hochladen und Ausliefern laufen ausschließlich über Server-Routen.
await step('Bucket runner-files', () => storage.createBucket({
  bucketId: 'runner-files', name: 'Runner Files',
  permissions: [], fileSecurity: false,
  maximumFileSize: 10 * 1024 * 1024,
}))

console.log('✔ Migration runner-001 fertig')
