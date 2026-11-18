/**
 * Migration pages-007: `pages_runs` — DIE LAUF-SPERRE DER SEITEN-ÜBERSETZUNG.
 *
 * Nacharbeit LL1 (d), 2026-11-18. Die KI-Übersetzung einer ganzen Seite
 * (`POST /api/pages/translate`) rechnete in der Anfrage, mit 120 s Frist —
 * länger, als der Webserver wartet (60 s). Der Mensch sah dann einen Fehler,
 * obwohl der bezahlte Lauf gelang, und klickte noch einmal. Künftig antwortet
 * der Start sofort (`202`), der Lauf rechnet hinter der Antwort, und der
 * Editor holt den Vorschlag ab.
 *
 * Jeder Lauf ist EINE Zeile hier, mit fester Id aus (scope, subject, seq) —
 * die einzige Operation, die bei Appwrite wirklich ausschliesst, ist
 * `createRow` mit einer festen Id (zweiter Versuch ⇒ 409). Begründung im
 * Ganzen: Kopf von `packages/core/shared/runLease.ts`. Das Grundschema steht
 * EINMAL in `scripts/migrations-lib/runLeaseTable.mts` (dieselbe Fabrik legt
 * `market_runs`, `insights_runs` und `brand_runs` an); dort auch das
 * Zeilenbudget der varchar-Spalten.
 *
 * ── ZWEI SPALTEN MEHR ALS DIE FABRIK ─────────────────────────────────────
 *  communityId  varchar 64, optional, Vorgabe '' — `pages` ist gepoolt; die
 *               Datentür (`tenantDb`) stempelt den Mandanten beim Anlegen,
 *               hängt ihn an jede Liste und belegt ihn vor jedem Ändern.
 *               Dieselbe Form wie `pages.communityId` (pages-005).
 *  result       MEDIUMTEXT, optional — der Vorschlag (Titel und Text als
 *               JSON, bis 12.000 Zeichen Text). MEDIUMTEXT liegt ausserhalb
 *               der Zeile und zählt nicht gegen das Zeilenbudget. Der
 *               nächste Lauf derselben Seite leert ihn am Vorgänger, das
 *               Löschen der Seite ebenso.
 * KEINE Personen-Spalte: die Zeilen nennen niemanden — Zeitpunkte, Ausgang,
 * Zielsprache, Modell und der Vorschlag selbst (eine Abschrift der Seite, die
 * genauso wenig einen Autor trägt wie `pages`).
 *
 * Server-only: `permissions: []`, `rowSecurity: false` — gelesen und
 * geschrieben wird nur mit dem Admin-Client über die Operator-Klinke.
 *
 * Läuft überall, wo der Layer `pages` läuft (apps/platform = account,
 * apps/control, apps/portfolio, apps/branding). Zerstört nichts, legt nur an,
 * und ist wiederholbar (409 → skip, vorhandene Spalten werden übersprungen).
 * Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --only pages-007
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { hasCode } from '../../../../scripts/migrations-lib/indexRetry.mts'
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

const TABLE = 'pages_runs'
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

console.log(`Migration pages-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await ensureRunLeaseTable({
  tablesDB,
  databaseId,
  tableId: TABLE,
  name: 'Pages Runs',
  sdk: { Query, TablesDBIndexType },
})

/** Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert listColumns 25. */
async function columnKeys(): Promise<Set<string>> {
  const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: TABLE, queries: [Query.limit(200)] })
  return new Set(columns.map(column => column.key))
}

async function step(label: string, run: () => Promise<unknown>): Promise<void> {
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

const existing = await columnKeys()

if (existing.has('communityId')) console.log(`↷ Column ${TABLE}.communityId (existiert bereits)`)
else {
  await step(`Column ${TABLE}.communityId`, () => tablesDB.createVarcharColumn({
    databaseId: databaseId!, tableId: TABLE, key: 'communityId', size: 64, required: false, xdefault: '',
  }))
}

if (existing.has('result')) console.log(`↷ Column ${TABLE}.result (existiert bereits)`)
else {
  await step(`Column ${TABLE}.result`, () => tablesDB.createMediumtextColumn({
    databaseId: databaseId!, tableId: TABLE, key: 'result', required: false,
  }))
}

// Erst fertig, wenn beide Spalten benutzbar sind — sonst schriebe der erste
// Lauf gegen eine Spalte im Zustand `processing`.
for (let i = 0; ; i++) {
  const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: TABLE, queries: [Query.limit(200)] })
  const mine = columns.filter(column => column.key === 'communityId' || column.key === 'result')
  if (mine.length === 2 && mine.every(column => column.status === 'available')) break
  if (i >= 300) throw new Error(`Spalten communityId/result von "${TABLE}" wurden nicht verfügbar`)
  await new Promise(resolve => setTimeout(resolve, 100))
}

console.log('✔ Migration pages-007 fertig')
