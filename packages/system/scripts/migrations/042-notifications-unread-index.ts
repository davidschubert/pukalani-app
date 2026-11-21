/**
 * Migration system-042: Index (read, $createdAt) auf `notifications` (Q12, PERF-008).
 *
 * Der Lauf für die Sammel-Mail (`core/server/utils/emailDigest.ts`) fragt alle
 * 30 Minuten `read = false`, sortiert nach Anlage, bis zu 2000 Zeilen. Die
 * vorhandenen Indizes beginnen mit `recipientId` — für diese Abfrage liest die
 * Datenbank deshalb die ganze Tabelle, und die wächst mit jeder Aktivität aller
 * Communities.
 *
 * NUR EIN INDEX, keine Spalte, keine Daten. Der Code braucht ihn nicht, um
 * richtig zu arbeiten — ohne ihn ist der Lauf nur langsamer. Deshalb ändert
 * sich `schema.latest`, aber nicht die `probe` im Manifest (ein Index ist am
 * Schema nicht ablesbar, `appwrite-migrationen.md`).
 *
 * `system` läuft auf JEDER Instanz ⇒ auf jeder fahren.
 *
 *   pnpm migrate --app <app> --only system-042
 *
 * RÜCKWEG: den Index `idx_unread_created` an `notifications` wieder entfernen (Appwrite-Konsole,
 * Tabelle → Indizes) — der Code bemerkt es nicht, er wird nur langsamer.
 *
 * Benötigte Key-Scopes: indexes.* (Migrations-Key). Idempotent (409 → skip).
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

console.log(`Migration system-042 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await indexStep('Index notifications.idx_unread_created', {
  tableId: 'notifications',
  key: 'idx_unread_created',
  type: TablesDBIndexType.Key,
  columns: ['read', '$createdAt'],
  orders: ['ASC', 'DESC'],
})

console.log('Migration system-042 abgeschlossen.')
