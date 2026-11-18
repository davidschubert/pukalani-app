/**
 * Migration control-009: Spalte `workspaces.stripeSubscriptionId` — hält die
 * AKTUELL für den Workspace gültige Stripe-Subscription. Grundlage des
 * Cross-Sub-Guards (#6): ein `customer.subscription.deleted` degradiert den
 * Workspace nur dann auf `free`, wenn die gekündigte Sub die hinterlegte ist —
 * so kann das Kündigen eines ALTEN Abos ein neueres nicht kannibalisieren.
 * Additiv + idempotent (409 → skip). Leerer Default = Legacy-Row/kein Abo.
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

console.log(`Migration control-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// NACHFOLGER-WACHE (PB1 c): steht `communities` (control-029), hat diese
// Instanz die Workspace-Zeit hinter sich — die Abrechnung hängt seit
// control-028 an der Community, `workspaces*` fallen mit control-031. Nicht
// wieder anlegen. `communities` entsteht NACH allen Workspace-Migrationen und
// bleibt; zwischen control-029 und -031 stehen beide, das Anlegen hier wäre
// dort ein 409. Auf einer frischen Instanz gibt es `communities` hier noch nicht.
const { superseded } = createSupersededGuard(tablesDB, databaseId, { Query })
if (await superseded({ table: 'workspaces', column: 'stripeSubscriptionId' }, { table: 'communities' }, 'control-028/031')) {
  console.log('↷ Migration control-009: nichts zu tun')
  process.exit(0)
}

// Stripe-Subscription-Ids sind kurz (sub_… ~28 Zeichen); 64 mit Reserve.
await step('Column workspaces.stripeSubscriptionId', () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'workspaces', key: 'stripeSubscriptionId', size: 64, required: false, xdefault: '',
}))

console.log('✔ Migration control-009 fertig')
