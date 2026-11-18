/**
 * Migration comments-011: `comments.tenantId` — Horizont-3 Pool-Datenpfad
 * (Etappe 4.1, Blueprint Naht 3). Rein ADDITIV und ruhend: '' / fehlend =
 * Silo-/Einzelbetrieb (heutiges Verhalten, alle Bestands-Rows bleiben wie
 * sie sind). Im Pool-Modus stempelt scopeRow() den Mandanten und scopeQuery()
 * filtert darauf — der Index trägt diese Filter.
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer comments
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'
import { createSupersededGuard } from '../../../../scripts/migrations-lib/supersededGuard.mts'

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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

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
async function waitForColumn(key: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: 'comments' })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Spalte "${key}" wurde nicht verfügbar`)
}

console.log(`Migration comments-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// NACHFOLGER-WACHE (PB1 c): steht `communityId` (comments-016), hat die
// Tabelle den Weg tenantId → communityId → tenantId gelöscht (comments-017)
// hinter sich. Auf einer frischen Instanz entsteht `communityId` erst weiter
// hinten — dort legt diese Datei Spalte und Index an, und comments-016
// leitet daraus Spalte, Backfill und Index-Zwilling ab.
const { superseded } = createSupersededGuard(tablesDB, databaseId, { Query })
if (await superseded({ table: 'comments', column: 'tenantId' }, { table: 'comments', column: 'communityId' }, 'comments-016/017')) {
  console.log('↷ Migration comments-011: nichts zu tun')
  process.exit(0)
}

// Appwrite-Row-Ids (künftige tenants-Row) sind max 36 Zeichen
await step('Column comments.tenantId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'comments', key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn('tenantId')
await indexStep('Index comments.idx_tenant', {
  tableId: 'comments', key: 'idx_tenant', type: TablesDBIndexType.Key, columns: ['tenantId'],
})

console.log('✔ Migration comments-011 fertig')
