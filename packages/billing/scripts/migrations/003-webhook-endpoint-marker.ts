/**
 * Migration billing-003: `stripe_settings.webhookEndpointId` (Audit-Befund
 * MEDIUM 2 zu F55, 2026-08-08).
 *
 * ADDITIV, eine Spalte, kein Index, kein Default-Wechsel. Sie trägt die Id des
 * Stripe-Webhook-Endpunkts, den DIESE Instanz selbst angelegt hat — die einzige
 * Auskunft, mit der die Statuskarte sagen kann, ob das gespeicherte `whsec_`
 * überhaupt zu dem Endpunkt gehört, den sie anzeigt. (Stripe gibt das Secret
 * nur beim Anlegen heraus; ein nachträglicher Abgleich ist unmöglich.)
 *
 * LEER = Herkunft unbekannt, und das ist der ehrliche Ausgangszustand jeder
 * bestehenden Zeile: Env-Wert, von Hand eingetragen oder aus der Zeit vor
 * dieser Marke. Es gibt deshalb NICHTS nachzutragen — kein Backfill.
 *
 * Der Code läuft auch OHNE diese Migration: das Setzen der Marke ist fail-soft
 * (`rememberStripeWebhookEndpointId`), die Karte sagt dann dauerhaft
 * „Herkunft unbestätigt".
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *   pnpm migrate --app <app> --layer billing
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

console.log(`Migration billing-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const cols = await existingColumnKeys('stripe_settings')

// Stripe-Endpunkt-Ids sehen aus wie `we_1Abc…` und bleiben deutlich unter 64
// Zeichen. Kein Geheimnis — deshalb im Klartext.
if (cols.has('webhookEndpointId')) {
  console.log('↷ Column stripe_settings.webhookEndpointId (existiert bereits)')
}
else {
  await step('Column stripe_settings.webhookEndpointId', () => tablesDB.createVarcharColumn({
    databaseId, tableId: 'stripe_settings', key: 'webhookEndpointId', size: 64, required: false, xdefault: '',
  }))
}

console.log('✔ Migration billing-003 fertig')
