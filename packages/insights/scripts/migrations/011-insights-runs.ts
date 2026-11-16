/**
 * Migration insights-011: `insights_runs` — DIE LAUF-SPERRE DES NEWSLETTERS.
 *
 * GA1 P18 (Fundament für BE-010). Gemeinsame Regeln wie insights-001…010
 * (server-only `permissions: []` / `rowSecurity: false`, kein `communityId`,
 * idempotent 409 → skip); sie läuft ausschliesslich auf der
 * `branding`-Instanz.
 *
 * ── WOZU ────────────────────────────────────────────────────────────────
 * Ein Versand-Stapel des Newsletters darf je Sende-Zeile nur einmal
 * gleichzeitig laufen (BE-010) — zwei gleichzeitige Stapel hiessen doppelte
 * Mails. Jeder Lauf ist EINE Zeile hier, mit fester Id aus (scope, subject,
 * seq); `subject` ist die Id der Sende-Zeile in `insights_sends`. Die einzige
 * Operation, die bei Appwrite wirklich ausschliesst, ist `createRow` mit
 * einer festen Id (zweiter Versuch ⇒ 409). Begründung im Ganzen: Kopf von
 * `packages/core/shared/runLease.ts`.
 *
 * Die Zeilen nennen niemanden (Zeitpunkte, Ausgang, Zählerstände) — daher
 * ohne Eintrag im GDPR-Beitrag des Layers.
 *
 * Das Schema steht EINMAL in `scripts/migrations-lib/runLeaseTable.mts`
 * (dieselbe Fabrik legt `market_runs` an); dort auch das Zeilenbudget.
 *
 * Zerstört nichts, legt nur an, und ist wiederholbar (409 → skip,
 * vorhandene Spalten werden übersprungen). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer insights
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

console.log(`Migration insights-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await ensureRunLeaseTable({
  tablesDB,
  databaseId,
  tableId: 'insights_runs',
  name: 'Insights Runs',
  sdk: { Query, TablesDBIndexType },
})

console.log('✔ Migration insights-011 fertig')
