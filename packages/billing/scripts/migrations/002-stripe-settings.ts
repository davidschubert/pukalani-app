/**
 * Migration billing-002: `stripe_settings` (F55, Davids Entscheidung 2026-08-08).
 *
 * EINE Zeile je Instanz (rowId fest `stripe`, angelegt beim ersten Speichern),
 * die den Stripe-Secret-Key und das Webhook-Signatur-Secret VERSCHLÜSSELT
 * trägt (AES-256-GCM, Schlüssel aus NUXT_BILLING_SETTINGS_KEY — server-only).
 *
 * DIE TABELLE HAT ABSICHTLICH KEINE PERMISSIONS UND KEIN rowSecurity: sie ist
 * damit ausschließlich über den Admin-Client erreichbar. Kein angemeldeter
 * Nutzer, keine Rolle und kein Label kommt an diese Zeile — auch der Betreiber
 * nicht; er sieht nur, was die Routen unter /api/control/stripe/* herausgeben
 * (Modus + letzte vier Zeichen).
 *
 * KEIN INDEX: es gibt genau eine Zeile mit bekannter Id, es wird nie gesucht.
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
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration billing-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table stripe_settings', () => tablesDB.createTable({
  databaseId,
  tableId: 'stripe_settings',
  name: 'Stripe Settings',
  // Leer + rowSecurity aus: NUR der Admin-Client kommt heran (s. Kopf).
  permissions: [],
  rowSecurity: false,
}))

const cols = await existingColumnKeys('stripe_settings')

// Der Umschlag ist `v1.` + base64(iv|tag|ciphertext). Ein sk_live_-Key liegt
// bei ~110 Zeichen, base64 macht daraus ~190 — 1024 ist reichlich Luft für
// längere Schlüssel künftiger Stripe-Generationen und bleibt weit unter dem
// utf8mb4-Zeilenbudget (MariaDB, s. CLAUDE.md-Notiz zu createMediumtextColumn).
await columnStep('Column stripe_settings.stripeSecretKeyEncrypted', 'stripeSecretKeyEncrypted', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'stripe_settings', key: 'stripeSecretKeyEncrypted', size: 1024, required: false, xdefault: '',
}))
await columnStep('Column stripe_settings.stripeWebhookSecretEncrypted', 'stripeWebhookSecretEncrypted', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'stripe_settings', key: 'stripeWebhookSecretEncrypted', size: 1024, required: false, xdefault: '',
}))
// Wer wann — die Zeile ist die einzige Spur einer Key-Rotation.
await columnStep('Column stripe_settings.updatedAt', 'updatedAt', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'stripe_settings', key: 'updatedAt', size: 32, required: false, xdefault: '',
}))
await columnStep('Column stripe_settings.updatedBy', 'updatedBy', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'stripe_settings', key: 'updatedBy', size: 36, required: false, xdefault: '',
}))

console.log('✔ Migration billing-002 fertig')
