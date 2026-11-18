/**
 * Migration control-013: `tenants.plan` — Quota-Plan des Pool-Tenants
 * (H3-4.3): staffelt die Quota-Limits (pukalani.tenancy.quota.plans, free/pro/
 * business). Additiv, Bestand = 'free'. Für Silo ohne Wirkung.
 * Idempotent (409 → skip). Aufruf über den Runner:
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

console.log(`Migration control-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// NACHFOLGER-WACHE (PB1 c): steht `communities` (control-029), ist `tenants`
// umgezogen und fällt mit control-030 — nicht wieder anlegen (control-029
// spiegelte sonst jede neu angelegte Spalte bei jedem vollen Lauf nach
// `communities`). Auf einer frischen Instanz entsteht `communities` erst
// weiter hinten, control-029 spiegelt dann Spalten, Zeilen und Indizes von hier.
const { superseded } = createSupersededGuard(tablesDB, databaseId, { Query })
if (await superseded({ table: 'tenants', column: 'plan' }, { table: 'communities' }, 'control-029/030')) {
  console.log('↷ Migration control-013: nichts zu tun')
  process.exit(0)
}

await step('Column tenants.plan', () => tablesDB.createEnumColumn({
  databaseId, tableId: 'tenants', key: 'plan', elements: ['free', 'pro', 'business'], required: false, xdefault: 'free',
}))

console.log('✔ Migration control-013 fertig')
