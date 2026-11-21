/**
 * Migration control-041: Index auf `communities.tenantId` (Q12, PERF-008).
 *
 * Drei Stellen fragen die Communities des Control Plane nach ihrem
 * Mandanten-Stempel: die Rolle eines Mitglieds
 * (`server/utils/communityMembersResolver.ts`), der Host für Mail-Links
 * (`communityHostResolver.ts`) und die Erreichbarkeit
 * (`unreachableCommunitiesResolver.ts`). Indizes gab es für `host`, `status`
 * und andere, aber keinen für `tenantId` — die Datenbank las jedes Mal die
 * ganze Tabelle.
 *
 * BEWUSST KEIN UNIQUE: ältere Zeilen tragen den Vorgabewert `''`, ein
 * eindeutiger Index scheiterte an ihnen. Für das Suchen reicht ein einfacher.
 *
 * NUR EIN INDEX, keine Spalte, keine Daten. Der Code arbeitet ohne ihn
 * richtig, nur langsamer. `schema.latest` zieht nach, die `probe` im Manifest
 * nicht (ein Index ist am Schema nicht ablesbar).
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE ────────────────────────────────────
 *
 *   pnpm migrate --app control --only control-041
 *
 * RÜCKWEG: den Index `idx_tenant` an `communities` wieder entfernen (Appwrite-Konsole,
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

console.log(`Migration control-041 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await indexStep('Index communities.idx_tenant', {
  tableId: 'communities',
  key: 'idx_tenant',
  type: TablesDBIndexType.Key,
  columns: ['tenantId'],
})

console.log('Migration control-041 abgeschlossen.')
