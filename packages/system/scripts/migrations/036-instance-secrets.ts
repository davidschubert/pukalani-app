/**
 * system-036 — GEHEIMNISSE DIESER INSTANZ, EINTRAGBAR ÜBER DIE KONSOLE
 * (Davids Entscheidung 2026-08-18).
 *
 * EINE Tabelle `instance_secrets`, EINE Zeile je Sorte (Zeilen-Id = Sorte,
 * heute nur `ai`). Inhalt ist NIE Klartext, sondern der `v1.`-Umschlag aus
 * `core/server/utils/secretBox.ts` (AES-256-GCM), dessen Schlüssel als
 * `NUXT_INSTANCE_SECRETS_KEY` in der Server-Env bleibt.
 *
 * ── WARUM NICHT IN `app_config` ───────────────────────────────────────────
 * Die trägt `read(any)` (system-005), damit Themes und Produkt-Flags live
 * propagieren — „AUFZÄHLBAR, geprüft und akzeptiert" steht dort im Kopf. Ein
 * API-Schlüssel wäre damit für jeden Besucher abrufbar. Diese Tabelle hat
 * deshalb LEERE Permissions und `rowSecurity: false`: nur der Admin-Client
 * kommt heran, genau wie `stripe_settings` (billing-002), dessen Muster diese
 * Tabelle folgt.
 *
 * ── WOZU DAS GUT IST ──────────────────────────────────────────────────────
 * `NUXT_AI_KEY` fehlte monatelang auf `platform`. Damit war das im Pro-Tarif
 * VERKAUFTE KI-Produkt auf jeder Kunden-Community dunkel, ohne dass irgendwo
 * etwas rot wurde — ein fehlender Schlüssel verhält sich exakt wie ein
 * abgeschaltetes Produkt. Ein Feld in der Betreiber-Konsole macht den Zustand
 * sichtbar und änderbar, ohne ssh.
 *
 * ── 1024 ZEICHEN ──────────────────────────────────────────────────────────
 * Ein OpenRouter-Schlüssel liegt bei ~73 Zeichen, base64 im Umschlag macht
 * daraus ~160. 1024 ist dieselbe Grosszügigkeit wie bei `stripe_settings` und
 * bleibt weit unter dem utf8mb4-Zeilenbudget von MariaDB.
 *
 * Aufruf: pnpm migrate --app <app> --layer system
 * ZIEL-INSTANZEN: jede — der system-Layer läuft überall mit.
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
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
/**
 * Vorab-Prüfung statt blindem 409: Appwrite prüft die Zeilengröße VOR der
 * Duplikat-Erkennung und antwortet auf ein erneutes createColumn unter
 * Umständen mit 400 statt 409 — dann wäre die Migration nicht mehr
 * idempotent (N2, an `app_config` gelernt).
 */
async function ensureColumn(tableId: string, key: string, create: () => Promise<unknown>) {
  try {
    // Query.limit ist PFLICHT (Falle aus events-006): ohne explizites Limit
    // liefert listColumns nur 25 Spalten, und eine abgeschnittene Liste meldet
    // fälschlich „Spalte fehlt".
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    if (columns.some(column => column.key === key)) {
      console.log(`↷ Column ${tableId}.${key} (existiert bereits)`)
      return
    }
  }
  catch {
    // Table fehlt o. Ä. — step() unten meldet es sauber
  }
  await step(`Column ${tableId}.${key}`, create)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    // Query.limit ist PFLICHT (Falle aus events-006): ohne explizites Limit
    // liefert listColumns nur 25 Spalten, und eine abgeschnittene Liste meldet
    // fälschlich „Spalte fehlt".
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-036 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const TABLE = 'instance_secrets'

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId,
  tableId: TABLE,
  name: 'Instance Secrets',
  // Leer + rowSecurity aus: NUR der Admin-Client kommt heran (s. Kopf).
  permissions: [],
  rowSecurity: false,
}))

await ensureColumn(TABLE, 'value', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'value', size: 1024, required: false, xdefault: '',
}))
// Wer wann — die Zeile ist die einzige Spur einer Schlüssel-Rotation.
await ensureColumn(TABLE, 'updatedAt', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'updatedAt', size: 32, required: false, xdefault: '',
}))
await ensureColumn(TABLE, 'updatedBy', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'updatedBy', size: 36, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

console.log('✔ Migration system-036 fertig')
console.log('  Neu: instance_secrets (leere Permissions, Inhalt AES-256-GCM-verschlüsselt)')
console.log('  Der Umschlag-Schlüssel bleibt Env: NUXT_INSTANCE_SECRETS_KEY (openssl rand -hex 32)')
