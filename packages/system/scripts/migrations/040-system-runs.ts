/**
 * Migration system-040: Tabelle `system_runs` — die Lauf-Sperre für Läufe, die
 * von Hand über ein Skript gestartet werden und nicht zweimal gleichzeitig
 * laufen dürfen (GA1 P13; erster Nutzer: `scripts/ops/strip-row-write-rights.mjs`).
 *
 * Dieselbe Sperre wie in `market_runs` und `insights_runs` (GA1 P18): je Lauf
 * eine Zeile mit fester Id aus (Art, Gegenstand, laufende Nummer) — das
 * zweite Anlegen derselben Id scheitert mit 409, und genau das ist die
 * Sperre. Der Zustand wird aus dem Herzschlag gerechnet, nie gespeichert.
 * Begründung im Ganzen: Kopf von `packages/core/shared/runLease.ts`.
 *
 * `subject` ist hier der NAME einer Tabelle, nie eine Person; im `detail`
 * stehen nur Zahlen. Die Tabelle hat deshalb keinen Personenbezug.
 *
 * Das Schema steht EINMAL in `scripts/migrations-lib/runLeaseTable.mts`.
 * Server-only (`permissions: []`, `rowSecurity: false`).
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren. Zerstört nichts, legt nur an, wiederholbar (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { ensureRunLeaseTable } from '../../../../scripts/migrations-lib/runLeaseTable.mts'

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

console.log(`Migration system-040 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await ensureRunLeaseTable({
  tablesDB,
  databaseId,
  tableId: 'system_runs',
  name: 'System Runs',
  sdk: { Query, TablesDBIndexType },
})

console.log('✔ Migration system-040 fertig')
