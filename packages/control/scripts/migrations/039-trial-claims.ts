/**
 * Migration control-039: DIE TESTPHASE GIBT ES EINMAL JE KONTO (BE-015).
 *
 * Davids Entscheidung vom 2026-11-16: die Testphase gehört der PERSON, und die
 * Person ist das KONTO im Runtime-Projekt (Projekt + Konto-Id) — nicht die
 * Community. Bis hierher bekam jede neu angelegte Community 14 Tage Pro; wer
 * nach dem Ende eine zweite anlegte, bekam die nächste Testphase.
 *
 * EINE Tabelle, `trial_claims`, EINE Zeile je Konto, mit FESTER Zeilen-Id
 * (`trialClaimRowId(projekt, konto)`, server/utils/trialClaims.ts). DAS ANLEGEN
 * DER ZEILE IST DIE VERGABE: 201 ⇒ dieses Konto bekommt jetzt seine
 * Testphase, 409 ⇒ es hatte schon eine. Kein „erst lesen, dann schreiben" —
 * Appwrite kennt kein bedingtes Schreiben, eine feste Id schon.
 *
 * Spalten:
 *  - `runtimeProjectId`, `runtimeUserId` — das Konto (dieselbe Id in zwei
 *    Projekten sind zwei Menschen).
 *  - `communityId` — die Community, für die die Testphase vergeben wurde.
 *  - `source` — `onboarding` (beim Anlegen) | `adopted` (Übernahme aus dem
 *    Bestand, scripts/backfill-trial-claims.mjs).
 *  - `claimedAt` — wann.
 *
 * Index `idx_user` auf `runtimeUserId`: DSGVO-Auskunft und -Löschung finden
 * die Zeile zwar über die feste Id, die Suche nach dem Konto soll aber ohne
 * Voll-Scan gehen (Betreiber-Rückfrage, Prüfskripte).
 *
 * Server-only: keine Rechte, keine Zeilen-Rechte. Nur der Admin-Client des
 * Control Plane liest und schreibt.
 *
 * ── REIHENFOLGE ────────────────────────────────────────────────────────────
 * Der Code läuft auch OHNE diese Tabelle (404 `table_not_found` ⇒ Testphase
 * wie bisher plus Fehler-Zeile `onboarding.trial_claims_missing`). Die
 * Migration gehört trotzdem VOR den Merge gefahren, sonst gilt die Regel erst
 * ab dem Lauf. Danach einmal den Bestand übernehmen:
 * `scripts/backfill-trial-claims.mjs` (erst zählen, dann `--apply`).
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE (Projekt `admin`) ─────────────────
 * Die Vergabe läuft ausschließlich im Control Plane. `verify-schema-parity`
 * erwartet die Tabelle deshalb nur dort (eigener Block `CONTROL_ONLY_TABLES`).
 *
 *   pnpm migrate --app control --only control-039
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const CLAIMS = 'trial_claims'

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

/** Vorhandene Spalten EINER Table — immer mit explizitem Limit (Default 25). */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
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

async function waitForColumns(tableId: string, keys: string[]) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const wanted = columns.filter(column => keys.includes(column.key))
    if (wanted.length === keys.length && wanted.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns ${keys.join(', ')} von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-039 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

await step(`Table ${CLAIMS}`, () => tablesDB.createTable({
  databaseId: db, tableId: CLAIMS, name: 'Trial Claims', permissions: [], rowSecurity: false,
}))
const claimCols = await existingColumnKeys(CLAIMS)

await columnStep(`Column ${CLAIMS}.runtimeProjectId`, 'runtimeProjectId', claimCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: CLAIMS, key: 'runtimeProjectId', size: 36, required: true,
}))
await columnStep(`Column ${CLAIMS}.runtimeUserId`, 'runtimeUserId', claimCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: CLAIMS, key: 'runtimeUserId', size: 36, required: true,
}))
// Die Community, für die die Testphase vergeben wurde. Pflicht: eine Vergabe
// ohne Community gibt es nicht ('' lehnt der Code ab).
await columnStep(`Column ${CLAIMS}.communityId`, 'communityId', claimCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: CLAIMS, key: 'communityId', size: 36, required: true,
}))
// 'onboarding' | 'adopted' — bewusst kein Enum (eine weitere Herkunft wäre
// sonst eine Migration).
await columnStep(`Column ${CLAIMS}.source`, 'source', claimCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: CLAIMS, key: 'source', size: 16, required: true,
}))
await columnStep(`Column ${CLAIMS}.claimedAt`, 'claimedAt', claimCols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: CLAIMS, key: 'claimedAt', required: true,
}))

await waitForColumns(CLAIMS, ['runtimeProjectId', 'runtimeUserId', 'communityId', 'source', 'claimedAt'])

// DSGVO: alle Zeilen EINES Kontos ohne Voll-Scan.
await indexStep(`Index ${CLAIMS}.idx_user`, {
  tableId: CLAIMS, key: 'idx_user', type: TablesDBIndexType.Key, columns: ['runtimeUserId'],
})

console.log('✔ Migration control-039 fertig')
console.log('  Neu: trial_claims (eine Zeile je Konto, feste Id) + idx_user')
console.log('  Danach: node packages/control/scripts/backfill-trial-claims.mjs (zählt nur; --apply schreibt)')
