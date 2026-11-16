/**
 * Migration system-041: Tabelle `consent_records` — der Nachweis einer
 * Zustimmung (AGB, Unternehmer-Bestätigung) an einer Stelle, die das Konto
 * nicht selbst ändern kann (SEC-008, GA1 P13 — Davids Entscheidung
 * 2026-11-12: „Die Zustimmung wird vom Server geprüft und an einer Stelle
 * festgehalten, die das Konto nicht selbst ändern kann").
 *
 * ── WARUM EINE EIGENE TABELLE ───────────────────────────────────────────
 * Bis hierher lag der Nachweis in den `prefs` des Kontos. `prefs` gehören dem
 * Konto: es kann sie bei der Datenbank selbst setzen, ändern und leeren. Ein
 * Eintrag dort belegt also nichts. Diese Tabelle ist server-only
 * (`permissions: []`, `rowSecurity: false`) — gelesen und geschrieben wird
 * nur mit dem Admin-Client (`core/server/utils/consentRecords.ts`).
 *
 * ── EINE ZEILE JE (KONTO, ART, FASSUNG) ──────────────────────────────────
 * Die Zeilen-Id ist aus genau diesen drei Werten gebildet. Ein zweiter
 * Versuch, dieselbe Zustimmung festzuhalten, endet im 409 — der Nachweis wird
 * nie überschrieben, der ERSTE Zeitpunkt bleibt stehen. Einen Unique-Index
 * braucht es daneben nicht (zweite Wahrheit).
 *
 * ── DAS SCHEMA ─────────────────────────────────────────────────────
 *  userId      varchar 36,  Pflicht — das Konto
 *  kind        varchar 16,  Pflicht — `terms` | `business`
 *  version     varchar 64,  optional — Fassung der Texte ('' = die App nennt keine)
 *  acceptedAt  datetime,    Pflicht — wann zugestimmt wurde
 *  way         varchar 16,  Pflicht — wie: `password` | `otp` | `oauth` |
 *                           `prompt` (nachgeholt) | `adopted` (aus dem
 *                           Bestand übernommen, nicht vom Server geprüft)
 *  source      varchar 255, optional — der Host, auf dem es geschah
 * varchar-Summe 387 Zeichen — weit unter dem Zeilenbudget (16.381).
 * KEINE IP-Adresse und kein Gerät: der Nachweis braucht sie nicht.
 *
 * Index `idx_user_kind` (key) trägt die eine Abfrage: „hat dieses Konto der
 * Art X zugestimmt, und welcher Fassung zuletzt?"
 *
 * Auskunft und Löschung: `packages/system/server/utils/userDataContributor.ts`.
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren. Zerstört nichts, legt nur an, wiederholbar.
 *
 *   pnpm migrate --app <app> --layer system
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
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
/** Vorab-Prüfung statt blindem 409 (Muster system-036). Query.limit ist Pflicht. */
async function ensureColumn(tableId: string, key: string, create: () => Promise<unknown>) {
  try {
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
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-041 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const TABLE = 'consent_records'

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId,
  tableId: TABLE,
  name: 'Consent Records',
  // Leer + rowSecurity aus: NUR der Admin-Client kommt heran (s. Kopf).
  permissions: [],
  rowSecurity: false,
}))

await ensureColumn(TABLE, 'userId', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'userId', size: 36, required: true,
}))
await ensureColumn(TABLE, 'kind', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'kind', size: 16, required: true,
}))
await ensureColumn(TABLE, 'version', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'version', size: 64, required: false, xdefault: '',
}))
await ensureColumn(TABLE, 'acceptedAt', () => tablesDB.createDatetimeColumn({
  databaseId, tableId: TABLE, key: 'acceptedAt', required: true,
}))
await ensureColumn(TABLE, 'way', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'way', size: 16, required: true,
}))
await ensureColumn(TABLE, 'source', () => tablesDB.createStringColumn({
  databaseId, tableId: TABLE, key: 'source', size: 255, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

await indexStep(`Index ${TABLE}.idx_user_kind`, {
  tableId: TABLE, key: 'idx_user_kind', type: TablesDBIndexType.Key, columns: ['userId', 'kind'],
})

console.log('✔ Migration system-041 fertig')
