/**
 * Migration market-005: `market_runs` — DIE LAUF-SPERRE DES MARKTVERGLEICHS.
 *
 * GA1 P18 (Fundament für BE-008). Gemeinsame Regeln wie market-001…004
 * (server-only `permissions: []` / `rowSecurity: false`, kein `communityId`,
 * Indizes nur über `createIndexSteps`); sie läuft ausschliesslich auf der
 * `branding`-Instanz.
 *
 * ── WOZU ────────────────────────────────────────────────────────────────
 * Ein Lauf des Marktvergleichs soll künftig HINTER der Antwort weiterlaufen
 * (BE-008) und darf je Branding nur einmal gleichzeitig laufen. Jeder Lauf
 * ist EINE Zeile hier, mit fester Id aus (scope, subject, seq) — die einzige
 * Operation, die bei Appwrite wirklich ausschliesst, ist `createRow` mit
 * einer festen Id (zweiter Versuch ⇒ 409). `subject` ist die Profil-Id;
 * gelöscht wird die Zeile mit dem Branding (`removeMarketProfileData`).
 * Begründung im Ganzen: Kopf von `packages/core/shared/runLease.ts`.
 *
 * Das Schema steht EINMAL in `scripts/migrations-lib/runLeaseTable.mts`
 * (dieselbe Fabrik legt `insights_runs` an); dort auch das Zeilenbudget.
 *
 * Zerstört nichts, legt nur an, und ist wiederholbar (409 → skip,
 * vorhandene Spalten werden übersprungen). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer market
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

console.log(`Migration market-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await ensureRunLeaseTable({
  tablesDB,
  databaseId,
  tableId: 'market_runs',
  name: 'Market Runs',
  sdk: { Query, TablesDBIndexType },
})

console.log('✔ Migration market-005 fertig')
