/**
 * Migration runner-003: `runs.resumeSessionId`.
 * Konzept: docs/archiv/AI-RUNNER.md § 4 (needs_input ist TERMINAL) / § 9
 * (das „Antworten"-Feld).
 *
 * EINE Spalte, additiv. Sie trägt die `sessionId` des VORGÄNGER-Laufs, wenn
 * dieser Lauf eine Fortsetzung ist (Antwort auf eine `needs_input`-Rückfrage).
 * Ist sie gesetzt, startet der Runner `claude` mit `--resume <sessionId>` statt
 * mit einem frischen `--session-id` (§ 7.2 / § 9) — die NEUE Session-Id kommt
 * dann aus dem Abschluss-JSON und wird wie gehabt gemeldet.
 *
 * WARUM EINE EIGENE SPALTE UND NICHT `sessionId` WIEDERVERWENDEN: `sessionId`
 * ist die Session DIESES Laufs (bei einer Fortsetzung erst am Ende bekannt),
 * `resumeSessionId` die des Vorgängers (von Anfang an bekannt). Beide zugleich
 * zu tragen ist der ganze Sinn — sonst wüsste der Runner nicht, WORAN er
 * anknüpft, und der Bericht verlöre die Kette.
 *
 * VARCHAR 36 wie `sessionId` (eine UUID). Default '' = gewöhnlicher Lauf, keine
 * Fortsetzung. Der Wert ist eine Vorgänger-Row-Session, NIE ein Aufrufer-Wert:
 * die Fortsetzungs-Route liest ihn aus dem Vorgänger-Lauf, nicht aus dem Body
 * (§ 8.2 — eine Fortsetzung wäscht die Herkunft nicht rein).
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

console.log(`Migration runner-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const runCols = await existingColumnKeys('runs')
await columnStep('Column runs.resumeSessionId', 'resumeSessionId', runCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'runs', key: 'resumeSessionId', size: 36, required: false, xdefault: '',
}))

// KEIN Index: die Spalte wird nie gefiltert, sondern immer zusammen mit ihrem
// Lauf gelesen (der Runner liest sie aus der Claim-Antwort). Ein Index wäre
// Schreiblast ohne Leser.
await waitForColumns('runs')

console.log('✔ Migration runner-003 fertig')
