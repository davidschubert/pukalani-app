/**
 * Migration control-004: Spalte `sites.features` — Feature-Snapshot je Site
 * (M6-T4): JSON-Array der wirksam aktiven Feature-Keys, geliefert von der
 * Site selbst (GET /api/platform/features) und vom Health-Sweep persistiert.
 * Additiv + idempotent (409 → skip; sites-Table hat Budget-Headroom).
 *
 *   pnpm migrate --app <app> --layer control
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'
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

console.log(`Migration control-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// NACHFOLGER-WACHE (PB1 c): steht `websites` (control-022), ist das Register
// umgezogen und `sites` fällt mit control-026 — nicht wieder anlegen. Auf
// einer frischen Instanz entsteht `websites` erst weiter hinten, control-022
// kopiert dann die Zeilen von hier.
const { superseded } = createSupersededGuard(tablesDB, databaseId, { Query })
if (await superseded({ table: 'sites', column: 'features' }, { table: 'websites' }, 'control-022/026')) {
  console.log('↷ Migration control-004: nichts zu tun')
  process.exit(0)
}

await step('Column sites.features', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'sites', key: 'features', size: 1000, required: false, xdefault: '[]',
}))

console.log('✔ Migration control-004 fertig')
